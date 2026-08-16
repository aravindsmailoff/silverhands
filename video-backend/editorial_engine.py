"""
editorial_engine.py - Hybrid Editorial Boundary Engine & Pacing Rules

Refines Gemini's high-level narrative edit decisions using deterministic ground truth:
- Whisper word-level timestamps & sentence boundaries
- Scene cuts from scene_detection.py (TransNetV2 / PySceneDetect)
- Silence gap & dead-air trimming
- Natural opening & closing extension (avoids sudden stops)
- Hard pacing & speed constraints
"""

import os
import re
from typing import List, Dict, Tuple, Optional


def refine_editorial_boundaries(
    segments: List[Dict],
    whisper_words: List[Dict],
    scene_list: Optional[List[Tuple]] = None,
    video_duration: float = 60.0
) -> Tuple[List[Dict], float]:
    """
    Refines Gemini proposed segments into precise editorial cuts.
    Input:
        segments: list of dicts with semantic_start, semantic_end, role, beat, speed, etc.
        whisper_words: list of [{'w': word, 's': start, 'e': end}]
        scene_list: list of (start_timecode, end_timecode) scene pairs
        video_duration: total duration of source video in seconds
    Output:
        (refined_segments, total_duration)
    """
    if not segments:
        return [], 0.0

    # Ensure words are sorted by start time
    words = sorted(whisper_words or [], key=lambda x: float(x.get('s', 0)))
    word_starts = [float(w.get('s', 0)) for w in words]
    word_ends = [float(w.get('e', 0)) for w in words]

    # Convert scene boundaries to float seconds
    scene_cuts = []
    if scene_list:
        for s, e in scene_list:
            try:
                # FrameTimecode to seconds
                scene_cuts.append(s.get_seconds())
                scene_cuts.append(e.get_seconds())
            except Exception:
                pass
    scene_cuts = sorted(list(set(scene_cuts)))

    refined = []
    num_segs = len(segments)

    for idx, seg in enumerate(segments):
        s_data = dict(seg)
        # Determine initial target boundaries
        raw_start = s_data.get('semantic_start', -1.0)
        if raw_start < 0:
            raw_start = s_data.get('start', 0.0)
        
        raw_end = s_data.get('semantic_end', -1.0)
        if raw_end < 0:
            raw_end = s_data.get('end', raw_start + 5.0)

        is_opening = (idx == 0) or s_data.get('is_natural_opening', False)
        is_closing = (idx == num_segs - 1) or s_data.get('is_natural_closing', False)
        contains_speech = s_data.get('contains_speech', True)

        if contains_speech and words:
            # 1. Snap Start (Speech)
            snapped_start = _snap_start_boundary(
                raw_start, word_starts, word_ends, scene_cuts, is_opening, search_window=1.5
            )

            # 2. Snap End (Speech)
            snapped_end = _snap_end_boundary(
                raw_end, word_starts, word_ends, scene_cuts, is_closing, video_duration, words, search_window=2.0
            )

            # 3. Handle Natural Closing Extension (avoids sudden stop)
            if is_closing:
                snapped_end = _extend_to_natural_speech_resolution(
                    snapped_end, words, video_duration, max_extension=2.5
                )
        else:
            # Visual segment: snap to nearest scene cut only (no speech word constraints)
            snapped_start = _snap_to_scene_only(raw_start, scene_cuts, tolerance=0.5)
            snapped_end = _snap_to_scene_only(raw_end, scene_cuts, tolerance=0.5)
            if is_closing and snapped_end < video_duration:
                snapped_end = min(video_duration, snapped_end + 0.5)

        # Ensure valid non-zero duration (minimum 1.8s per segment)
        if snapped_end - snapped_start < 1.8:
            snapped_end = min(video_duration, snapped_start + 2.0)

        s_data['start'] = round(snapped_start, 3)
        s_data['end'] = round(snapped_end, 3)
        s_data['recommended_video_start'] = round(snapped_start, 3)
        s_data['recommended_video_end'] = round(snapped_end, 3)


        # 4. Refine transition type & audio lead/lag defaults
        t_type = s_data.get('transition_type', 'cut')
        lead_lag = float(s_data.get('audio_lead_lag', 0.0))
        if t_type == 'j_cut' and lead_lag <= 0:
            s_data['audio_lead_lag'] = 0.5
        elif t_type == 'l_cut' and lead_lag <= 0:
            s_data['audio_lead_lag'] = 0.5
        elif t_type == 'cut':
            s_data['audio_lead_lag'] = 0.0

        refined.append(s_data)

    # 5. Enforce Pacing and Speed Rules
    refined = enforce_pacing_rules(refined)

    # 6. Calculate total planned duration
    total_dur = sum((s['end'] - s['start']) / s.get('speed', 1.0) for s in refined)

    # 7. Duration balancing to keep between 35s and 60s
    if total_dur > 60.0:
        refined, total_dur = _trim_to_duration_cap(refined, max_duration=58.0)

    return refined, total_dur


def _snap_to_scene_only(target: float, scene_cuts: List[float], tolerance: float = 0.5) -> float:
    """Snaps target boundary to the nearest scene cut within tolerance, or returns target."""
    if not scene_cuts:
        return max(0.0, target)
    for sc in scene_cuts:
        if abs(sc - target) <= tolerance:
            return max(0.0, sc)
    return max(0.0, target)


def _snap_start_boundary(
    target_start: float,
    word_starts: List[float],
    word_ends: List[float],
    scene_cuts: List[float],
    is_opening: bool,
    search_window: float = 1.5
) -> float:

    """Snaps target start to a clean word start and/or scene cut."""
    # Priority 1: Scene cut within tight tolerance
    for sc in scene_cuts:
        if abs(sc - target_start) <= 0.4:
            return max(0.0, sc)

    if not word_starts:
        return max(0.0, target_start)

    # Find nearest word starts
    candidates = [ws for ws in word_starts if abs(ws - target_start) <= search_window]
    if candidates:
        best_ws = min(candidates, key=lambda ws: abs(ws - target_start))
        # Check gap to previous word end
        prev_ends = [we for we in word_ends if we <= best_ws]
        if prev_ends:
            gap = max(0.0, best_ws - max(prev_ends))
            # Leave at most 0.25s silence before the word
            lead = min(0.25, gap / 2.0)
        else:
            lead = 0.2
        return max(0.0, best_ws - lead)

    return max(0.0, target_start)


def _snap_end_boundary(
    target_end: float,
    word_starts: List[float],
    word_ends: List[float],
    scene_cuts: List[float],
    is_closing: bool,
    video_duration: float,
    words: List[Dict],
    search_window: float = 2.0
) -> float:
    """Snaps target end to a clean sentence/thought finish."""
    # Priority 1: Scene cut within tolerance if not closing speech
    for sc in scene_cuts:
        if abs(sc - target_end) <= 0.4:
            return min(video_duration, sc)

    if not word_ends:
        return min(video_duration, target_end)

    candidates = [we for we in word_ends if abs(we - target_end) <= search_window]
    if candidates:
        best_we = min(candidates, key=lambda we: abs(we - target_end))
        next_starts = [ws for ws in word_starts if ws >= best_we]
        if next_starts:
            gap = max(0.0, min(next_starts) - best_we)
            # Give comfortable silence trail
            tail = min(0.35, gap / 2.0)
        else:
            tail = 0.35
        return min(video_duration, best_we + tail)

    return min(video_duration, target_end)


def _extend_to_natural_speech_resolution(
    end_time: float,
    words: List[Dict],
    video_duration: float,
    max_extension: float = 2.5
) -> float:
    """
    Scans forward from end_time to ensure the video does not stop abruptly mid-sentence.
    Finds the first pause >= 0.4s or word ending with sentence punctuation (. ! ?).
    """
    if not words:
        return min(video_duration, end_time + 0.5)

    # Find words near and shortly after end_time
    after_words = [w for w in words if float(w.get('e', 0)) >= end_time - 0.2]
    if not after_words:
        return min(video_duration, end_time + 0.4)

    for i in range(len(after_words)):
        w = after_words[i]
        w_text = str(w.get('w', '')).strip()
        w_end = float(w.get('e', 0))

        # Punctuation check
        if any(w_text.endswith(p) for p in ('.', '!', '?', '。', '！', '？')):
            return min(video_duration, w_end + 0.4)

        # Silence gap check to next word
        if i + 1 < len(after_words):
            next_start = float(after_words[i + 1].get('s', 0))
            if next_start - w_end >= 0.45:
                return min(video_duration, w_end + 0.35)

        # Don't extend further than max_extension
        if w_end - end_time > max_extension:
            return min(video_duration, w_end + 0.3)

    return min(video_duration, end_time + 0.5)


def enforce_pacing_rules(segments: List[Dict]) -> List[Dict]:
    """
    Applies strict pacing hierarchy:
    1. Speech segments MUST stay at 1.0x (capped at 1.05x max).
    2. Talking head / Hook / Outro segments MUST stay at 1.0x.
    3. Hand close-ups and delicate demonstrations capped at 1.1x.
    4. Repetitive physical actions without speech allowed up to 1.4x.
    5. Closing payoff segment MUST stay at 1.0x.
    """
    for s in segments:
        contains_speech = s.get('contains_speech', True)
        vis_type = s.get('visual_action_type', 'talking_head')
        role = s.get('role', 'core_showcase')
        speed = float(s.get('speed', 1.0))

        if s.get('is_natural_closing') or role == 'closing':
            s['speed'] = 1.0
        elif contains_speech or vis_type == 'talking_head' or role == 'opening':
            if speed > 1.05:
                s['speed'] = 1.0
        elif vis_type == 'hand_close_up':
            if speed > 1.15:
                s['speed'] = 1.1
        elif vis_type in ('action', 'still') and not contains_speech:
            if speed > 1.5:
                s['speed'] = 1.4
            elif speed < 1.0:
                s['speed'] = 1.0

    return segments


def _trim_to_duration_cap(segments: List[Dict], max_duration: float = 58.0) -> Tuple[List[Dict], float]:
    """
    If total duration exceeds cap:
    1. Shorten lowest-priority/supporting segments first
    2. Gently speed up visual-only action
    """
    curr_dur = sum((s['end'] - s['start']) / s.get('speed', 1.0) for s in segments)
    if curr_dur <= max_duration:
        return segments, curr_dur

    excess = curr_dur - max_duration

    # Try speeding up non-speech action segments first
    for s in segments:
        if not s.get('contains_speech') and s.get('visual_action_type') == 'action':
            s['speed'] = min(1.4, s.get('speed', 1.0) * 1.2)
            curr_dur = sum((s['end'] - s['start']) / s.get('speed', 1.0) for s in segments)
            if curr_dur <= max_duration:
                return segments, curr_dur

    # If still over, trim non-essential supporting segments by up to 1.5s
    for s in segments:
        if s.get('role') not in ('opening', 'closing') and s.get('narrative_necessity') in ('supporting', 'optional'):
            seg_dur = s['end'] - s['start']
            if seg_dur > 3.5:
                trim_amt = min(1.5, seg_dur - 2.5)
                s['end'] -= trim_amt
                s['recommended_video_end'] = s['end']
                curr_dur = sum((s['end'] - s['start']) / s.get('speed', 1.0) for s in segments)
                if curr_dur <= max_duration:
                    break

    return segments, curr_dur
