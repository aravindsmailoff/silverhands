"""
SilverHands Pipeline Profiler
==============================
Runs the full SilverHands pipeline on a video and records wall-clock time
for every stage. Does NOT modify any source files — uses monkey-patching.

Usage (from the vediomodel directory):
    python profile_pipeline.py path/to/video.mp4 [--focus "your focus text"]

Output:
    - Stage-by-stage timing table (whisper vs parakeet)
    - Top 3 bottleneck report
    - Transcript quality comparison
    - profile_report.json in --output-dir
"""
import os
import sys
import time
import json
import argparse
from functools import wraps

# ---------------------------------------------------------------------------
# Timing infrastructure
# ---------------------------------------------------------------------------

_timings = {}   # stage_name -> list of elapsed seconds


class _Timer:
    def __init__(self, stage_name):
        self._stage = stage_name
    def __enter__(self):
        self._t0 = time.perf_counter()
        return self
    def __exit__(self, *_):
        elapsed = time.perf_counter() - self._t0
        _timings.setdefault(self._stage, []).append(elapsed)
        print(f"   [TIMER] [{self._stage}] {elapsed:.1f}s")


def _t(stage_name):
    return _Timer(stage_name)


# ---------------------------------------------------------------------------
# Run one full pipeline pass
# ---------------------------------------------------------------------------

def run_pass(video_path, backend, focus, output_dir):
    global _timings
    _timings = {}

    os.environ["TRANSCRIBE_BACKEND"] = backend
    os.environ["AUTO_CAPTIONS"] = "0"

    # Force reimport so env vars are picked up fresh
    import importlib
    for mod_name in list(sys.modules):
        if mod_name in ("transcribe_backends", "subtitles"):
            del sys.modules[mod_name]

    import cv2
    import main as m
    import scene_detection
    import editorial_engine
    import jl_cut_assembler
    import reframe_v2
    import transcribe_backends as tb

    cap = cv2.VideoCapture(video_path)
    fps      = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames   = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frames / fps
    cap.release()

    print(f"\n{'='*62}")
    print(f" Backend : {backend.upper()}")
    print(f" Duration: {duration:.1f}s  |  Focus: {focus or '(none)'}")
    print(f"{'='*62}")

    # ---- STAGE: Transcription ----
    with _t("transcription"):
        transcript = tb.transcribe_media(video_path)

    lang   = transcript.get("language", "?")
    nsegs  = len(transcript.get("segments", []))
    nwords = sum(len(s.get("words", [])) for s in transcript.get("segments", []))
    print(f"   lang={lang}  segments={nsegs}  words={nwords}")

    # ---- STAGE: SilverHands Pass 1 + Pass 2 ----
    # Intercept _run_gemini_stage to split by call index
    orig_rgs    = m._run_gemini_stage
    call_idx    = {"n": 0}
    pass_timings = {}

    def patched_rgs(client, model_name, prompt, schema):
        call_idx["n"] += 1
        key = f"gemini_pass{call_idx['n']}"
        with _t(key):
            return orig_rgs(client, model_name, prompt, schema)
    m._run_gemini_stage = patched_rgs

    try:
        with _t("silverhands_total"):
            showcase_data = m.get_silverhands_showcase(
                transcript, duration,
                focus_guidance=focus or "",
                mode="highlight"
            )
    finally:
        m._run_gemini_stage = orig_rgs

    if not showcase_data or "segments" not in showcase_data:
        print("   ERROR: showcase design failed — skipping render stages")
        return dict(_timings), transcript

    # ---- STAGE: Scene detection ----
    with _t("scene_detection"):
        try:
            scene_list, _ = scene_detection.detect_scenes(video_path)
        except Exception as e:
            print(f"   WARN scene_detection: {e}")
            scene_list = []

    # ---- STAGE: Editorial refinement ----
    words = []
    for seg in transcript.get("segments", []):
        for w in seg.get("words", []):
            words.append({"w": w["word"], "s": w["start"], "e": w["end"]})

    raw_segs = showcase_data["segments"]
    with _t("editorial_refinement"):
        final_segs, total_dur = editorial_engine.refine_editorial_boundaries(
            raw_segs, words, scene_list, duration
        )
    print(f"   segments={len(final_segs)}  planned_dur={total_dur:.1f}s")

    # ---- STAGE: J/L cut assembly ----
    intermediate = os.path.join(output_dir, f"profile_{backend}_intermediate.mp4")
    with _t("jl_assembly"):
        try:
            jl_cut_assembler.build_with_editorial_cuts(video_path, final_segs, intermediate)
        except Exception as e:
            print(f"   WARN jl_assembly: {e}")

    # ---- STAGE: Reframe ----
    clip_out = os.path.join(output_dir, f"profile_{backend}_clip.mp4")
    if os.path.exists(intermediate):
        with _t("reframe"):
            try:
                reframe_v2.render(intermediate, clip_out, 9/16)
            except Exception as e:
                print(f"   WARN reframe: {e}")
        os.remove(intermediate)

    return dict(_timings), transcript


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

STAGE_ORDER = [
    ("transcription",        "Transcription"),
    ("scene_detection",      "Scene detection (TransNetV2)"),
    ("silverhands_total",    "SilverHands total (P1+P2)"),
    ("gemini_pass1",         "  ↳ Gemini Pass 1 (batch 1)"),
    ("gemini_pass2",         "  ↳ Gemini Pass 2 (batch 2)"),
    ("gemini_pass3",         "  ↳ Gemini Pass 3 (batch 3)"),
    ("gemini_pass4",         "  ↳ Gemini Pass 4 (batch 4)"),
    ("gemini_pass5",         "  ↳ Gemini Pass 5 (showcase plan)"),
    ("editorial_refinement", "Editorial boundary refinement"),
    ("jl_assembly",          "J/L cut assembly (ffmpeg)"),
    ("reframe",              "Reframe v2 (analysis + render)"),
    ("captions",             "Subtitle generation"),
]


def _sum_stage(timings, key):
    vals = timings.get(key, [])
    return sum(vals) if vals else None


def print_report(tw, tp, tr_w, tr_p):
    print("\n\n" + "=" * 72)
    print("  SILVERHANDS PIPELINE PROFILING REPORT")
    print("=" * 72)

    rows = []
    for key, label in STAGE_ORDER:
        t_w = _sum_stage(tw, key)
        t_p = _sum_stage(tp, key)
        if t_w is None and t_p is None:
            continue
        if t_w and t_p:
            ratio = t_w / t_p
            if ratio > 1.05:
                delta = f"Parakeet {ratio:.1f}x faster"
            elif ratio < 0.95:
                delta = f"Whisper {1/ratio:.1f}x faster"
            else:
                delta = "equal"
        else:
            delta = ""
        rows.append((label,
                     f"{t_w:.1f}s" if t_w else "--",
                     f"{t_p:.1f}s" if t_p else "--",
                     delta))

    w_total = sum(sum(v) for v in tw.values())
    p_total = sum(sum(v) for v in tp.values())

    col = max((len(r[0]) for r in rows), default=30) + 2
    hdr = f"\n  {'Stage':<{col}} {'Whisper':>9} {'Parakeet':>9}  Delta"
    print(hdr)
    print(f"  {'-'*col} {'-'*9} {'-'*9}  {'-'*28}")
    for label, t_w, t_p, delta in rows:
        print(f"  {label:<{col}} {t_w:>9} {t_p:>9}  {delta}")
    print(f"  {'-'*col} {'-'*9} {'-'*9}")
    print(f"  {'TOTAL':<{col}} {f'{w_total:.1f}s':>9} {f'{p_total:.1f}s':>9}")

    # Transcript quality
    print("\n\n  TRANSCRIPT QUALITY")
    print(f"  {'-'*50}")
    for be, tr in [("Whisper ", tr_w), ("Parakeet", tr_p)]:
        nw   = sum(len(s.get("words", [])) for s in tr.get("segments", []))
        lang = tr.get("language", "?")
        snip = (tr.get("text") or "")[:120].replace("\n", " ")
        print(f"  {be}: lang={lang}  words={nw}")
        print(f"         \"{snip}...\"")

    # Top 3 bottlenecks (by whisper time)
    print("\n\n  TOP 3 BOTTLENECKS  (whisper run, % of total)")
    print(f"  {'-'*50}")
    ranked = sorted(
        [(label, _sum_stage(tw, key) or 0) for key, label in STAGE_ORDER
         if not label.startswith("  ")],
        key=lambda x: -x[1]
    )
    for i, (label, t) in enumerate(ranked[:3], 1):
        pct = 100 * t / w_total if w_total else 0
        bar = "#" * int(pct / 2)
        print(f"  #{i}  {label}: {t:.1f}s ({pct:.0f}%)  {bar}")

    print("\n" + "=" * 72)

    return {
        "whisper":  {k: sum(v) for k, v in tw.items()},
        "parakeet": {k: sum(v) for k, v in tp.items()},
        "whisper_total": w_total,
        "parakeet_total": p_total,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Profile SilverHands pipeline")
    ap.add_argument("video",          help="Path to video file")
    ap.add_argument("--focus",  default="",  help="SilverHands focus guidance")
    ap.add_argument("--output-dir", default=".", help="Dir for temp clips & JSON report")
    ap.add_argument("--backend", default="both",
                    choices=["whisper", "parakeet", "both"],
                    help="Which transcription backend to profile (default: both)")
    args = ap.parse_args()

    if not os.path.exists(args.video):
        print(f"ERROR: file not found: {args.video}")
        sys.exit(1)

    os.makedirs(args.output_dir, exist_ok=True)

    tw, tr_w = {}, {"text": "", "language": "?", "segments": []}
    tp, tr_p = {}, {"text": "", "language": "?", "segments": []}

    if args.backend in ("whisper", "both"):
        print("\n>>> PASS: WHISPER")
        tw, tr_w = run_pass(args.video, "whisper", args.focus, args.output_dir)

    if args.backend in ("parakeet", "both"):
        print("\n>>> PASS: PARAKEET")
        tp, tr_p = run_pass(args.video, "parakeet", args.focus, args.output_dir)

    if args.backend == "whisper":
        tp, tr_p = tw, tr_w
    elif args.backend == "parakeet":
        tw, tr_w = tp, tr_p

    report = print_report(tw, tp, tr_w, tr_p)

    out_json = os.path.join(args.output_dir, "profile_report.json")
    with open(out_json, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(f"\nFull timing data -> {out_json}\n")


if __name__ == "__main__":
    main()
