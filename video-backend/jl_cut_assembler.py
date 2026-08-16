"""
jl_cut_assembler.py - Audio-Aware Assembly Engine with J-Cut & L-Cut Transitions

Assembles multiple video segments with support for:
- Professional J-cuts (audio leads next visual)
- Professional L-cuts (audio trails current visual into next scene)
- Natural audio endings with gentle closing fade-out to prevent sudden stops
- Global loudness normalization (EBU R128 / -14 LUFS)
"""

import os
import subprocess
import tempfile
import shutil
from typing import List, Dict

from ffmpeg_utils import video_encode_args, audio_encode_args, QUALITY, METADATA_SCRUB, LOUDNORM_FILTER


def _run_cmd(cmd: List[str]):
    """Runs a subprocess command with error handling."""
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        err_msg = res.stderr.decode('utf-8', errors='replace')
        print(f"   ❌ FFmpeg error: {err_msg[-400:]}")
        raise RuntimeError(f"FFmpeg command failed with code {res.returncode}")


def build_with_editorial_cuts(
    input_video: str,
    segments: List[Dict],
    output_path: str
) -> str:
    """
    Builds the intermediate showcase video from refined editorial segments.
    Applies J-cuts/L-cuts where specified and adds a natural closing audio fade.
    """
    if not segments:
        raise ValueError("Cannot assemble empty segment list.")

    print(f"🎬 [JL-Assembler] Assembling {len(segments)} segments with audio-aware transitions...")
    workdir = tempfile.mkdtemp(prefix="silverhands_jl_")
    
    try:
        extracted_clips = []
        
        # Step 1: Extract individual segments
        for idx, seg in enumerate(segments):
            start = float(seg['start'])
            end = float(seg['end'])
            dur = max(0.5, end - start)
            speed = float(seg.get('speed', 1.0))
            is_last = (idx == len(segments) - 1)
            is_closing = is_last or seg.get('is_natural_closing', False)
            
            clip_path = os.path.join(workdir, f"clip_{idx:03d}.mp4")
            
            print(f"   ✂️ Extracting segment {idx+1}/{len(segments)}: [{start:.2f}s -> {end:.2f}s] ({dur:.2f}s @ {speed}x) | {seg.get('transition_type', 'cut')}")
            
            cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-ss", str(start), "-t", str(dur), "-i", input_video
            ]
            
            v_filters = []
            a_filters = []
            
            if speed != 1.0:
                v_filters.append(f"setpts={(1.0 / speed):.4f}*PTS")
                a_filters.append(f"atempo={speed:.4f}")
            
            # Apply smooth audio fade out on the final closing segment to avoid sudden stop
            if is_closing:
                effective_dur = dur / speed
                fade_start = max(0.0, effective_dur - 0.7)
                a_filters.append(f"afade=t=out:st={fade_start:.2f}:d=0.7")
            
            if v_filters:
                cmd.extend(["-filter:v", ",".join(v_filters)])
            if a_filters:
                cmd.extend(["-filter:a", ",".join(a_filters)])
                
            cmd.extend([
                *video_encode_args(QUALITY),
                "-c:a", "aac",
                clip_path
            ])
            _run_cmd(cmd)
            extracted_clips.append(clip_path)

        # Step 2: Assemble with J/L cut smoothing or concat
        # Check if any J-cuts or L-cuts exist
        has_complex_cuts = any(s.get('transition_type') in ('j_cut', 'l_cut') for s in segments[1:])
        enable_jl = os.environ.get("ENABLE_JL_CUTS", "1") == "1"
        
        if has_complex_cuts and enable_jl and len(extracted_clips) > 1:
            print(f"   🎛️ Applying J/L cut crossfades across {len(extracted_clips)} clips...")
            _assemble_complex_jl_cuts(extracted_clips, segments, output_path, workdir)
        else:
            print(f"   🔗 Concatenating {len(extracted_clips)} segments and applying global loudnorm...")
            list_path = os.path.join(workdir, "concat.txt")
            with open(list_path, "w", encoding="utf-8") as f:
                for p in extracted_clips:
                    f.write(f"file '{p.replace(os.sep, '/')}'\n")
                    
            concat_cmd = [
                "ffmpeg", "-y", "-loglevel", "error",
                "-f", "concat", "-safe", "0", "-i", list_path,
                "-c:v", "copy",
                *audio_encode_args(),
                *METADATA_SCRUB,
                output_path
            ]
            _run_cmd(concat_cmd)

        print(f"   ✅ Editorial Intermediate Video assembled at: {output_path}")

    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    return output_path


def _assemble_complex_jl_cuts(
    clip_paths: List[str],
    segments: List[Dict],
    output_path: str,
    workdir: str
):
    """
    Performs multi-clip assembly with J-cut / L-cut audio crossfades using FFmpeg filter_complex.
    """
    n = len(clip_paths)
    inputs = []
    for p in clip_paths:
        inputs.extend(["-i", p])

    # Build filter_complex string
    # Audio streams are chained with acrossfade for J/L transitions, Video streams are concatenated
    filter_parts = []
    
    # Video concat
    v_inputs = "".join(f"[{i}:v]" for i in range(n))
    filter_parts.append(f"{v_inputs}concat=n={n}:v=1:a=0[v_out]")
    
    # Audio crossfade chain
    if n == 1:
        a_final = "[0:a]"
    else:
        # Chain audio acrossfades
        last_a = "[0:a]"
        for i in range(1, n):
            seg_trans = segments[i].get('transition_type', 'cut')
            lead_lag = float(segments[i].get('audio_lead_lag', 0.4))
            cross_dur = min(0.5, max(0.1, lead_lag)) if seg_trans in ('j_cut', 'l_cut') else 0.05
            
            next_a = f"[a_xf_{i}]" if i < n - 1 else "[a_out]"
            filter_parts.append(f"{last_a}[{i}:a]acrossfade=d={cross_dur:.2f}:c1=tri:c2=tri{next_a}")
            last_a = next_a

    filter_complex_str = ";".join(filter_parts)
    
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        *inputs,
        "-filter_complex", filter_complex_str,
        "-map", "[v_out]",
        "-map", "[a_out]",
        *video_encode_args(QUALITY),
        *audio_encode_args(),
        *METADATA_SCRUB,
        output_path
    ]
    
    try:
        _run_cmd(cmd)
    except Exception as e:
        print(f"   ⚠️ Complex filter failed ({e}) — falling back to clean concat list")
        list_path = os.path.join(workdir, "fallback_concat.txt")
        with open(list_path, "w", encoding="utf-8") as f:
            for p in clip_paths:
                f.write(f"file '{p.replace(os.sep, '/')}'\n")
        fallback_cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", list_path,
            "-c:v", "copy",
            *audio_encode_args(),
            *METADATA_SCRUB,
            output_path
        ]
        _run_cmd(fallback_cmd)
