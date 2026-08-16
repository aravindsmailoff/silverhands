"""
Adaptive & Targeted Visual Frame Sampler
=========================================
Extracts temporal keyframes from video footage for Gemini Multimodal / Video Understanding.
Features:
- Adaptive interval scaling based on source duration (2s/3s/5s/8s/10s) with a hard cap of 60 frames.
- Downscaled, lightweight JPEG encoding (max 512px) to keep API payloads fast and cost-effective.
- Targeted secondary pass for dense action sampling in high-importance regions.
"""

import os
import cv2
import base64
from typing import List, Dict, Tuple, Any


def get_adaptive_interval(video_duration: float) -> float:
    """Return the frame sampling interval in seconds based on duration."""
    if video_duration <= 120.0:
        return 2.0
    elif video_duration <= 300.0:
        return 3.0
    elif video_duration <= 600.0:
        return 5.0
    elif video_duration <= 1200.0:
        return 8.0
    else:
        return 10.0


def _encode_frame(frame, max_dim=512, jpeg_quality=55) -> Tuple[str, bytes]:
    """Resize frame keeping aspect ratio and encode to base64 JPEG."""
    h, w = frame.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / float(max(h, w))
        nw, nh = int(w * scale), int(h * scale)
        frame = cv2.resize(frame, (nw, nh), interpolation=cv2.INTER_AREA)

    encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_quality]
    success, buffer = cv2.imencode('.jpg', frame, encode_param)
    if not success:
        return "", b""
    img_bytes = buffer.tobytes()
    b64_str = base64.b64encode(img_bytes).decode('utf-8')
    return b64_str, img_bytes


def sample_frames_adaptive(video_path: str, video_duration: float, max_frames: int = 60) -> List[Dict[str, Any]]:
    """
    Extract adaptive frames across the video.
    Returns list of dicts: [{'timestamp': float, 'base64_jpeg': str, 'image_bytes': bytes}]
    """
    if not os.path.exists(video_path):
        print(f"⚠️ [visual_sampler] Video not found: {video_path}")
        return []

    interval = get_adaptive_interval(video_duration)
    
    # Generate timestamp targets
    timestamps = []
    t = 0.5  # start slightly offset to avoid black start
    while t < video_duration:
        timestamps.append(round(t, 2))
        t += interval

    # If exceeding max_frames, downsample uniformly
    if len(timestamps) > max_frames:
        step = len(timestamps) / float(max_frames)
        timestamps = [timestamps[int(i * step)] for i in range(max_frames)]

    print(f"🖼️ [visual_sampler] Extracting {len(timestamps)} adaptive frames (interval ~{interval}s, max {max_frames})...")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"⚠️ [visual_sampler] Could not open video: {video_path}")
        return []

    sampled = []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    for ts in timestamps:
        target_frame = int(round(ts * fps))
        if target_frame >= total_frames:
            target_frame = max(0, total_frames - 1)

        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        if not ret or frame is None:
            continue

        b64, img_bytes = _encode_frame(frame)
        if b64:
            sampled.append({
                "timestamp": ts,
                "base64_jpeg": b64,
                "image_bytes": img_bytes,
            })

    cap.release()
    print(f"   Successfully extracted {len(sampled)} frames.")
    return sampled


def sample_frames_targeted(
    video_path: str,
    regions: List[Tuple[float, float]],
    video_duration: float,
    frames_budget: int = 20,
    dense_interval: float = 1.5
) -> List[Dict[str, Any]]:
    """
    Densely sample specific regions of interest (e.g. high-importance visual action beats).
    """
    if not os.path.exists(video_path) or not regions:
        return []

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Collect desired timestamps
    timestamps = []
    for r_start, r_end in regions:
        t = max(0.0, r_start)
        end = min(video_duration, r_end)
        while t <= end:
            timestamps.append(round(t, 2))
            t += dense_interval

    # Deduplicate and sort
    timestamps = sorted(list(set(timestamps)))
    if len(timestamps) > frames_budget:
        step = len(timestamps) / float(frames_budget)
        timestamps = [timestamps[int(i * step)] for i in range(frames_budget)]

    print(f"🎯 [visual_sampler] Targeted sampling: {len(timestamps)} frames across {len(regions)} region(s)...")

    sampled = []
    for ts in timestamps:
        target_frame = int(round(ts * fps))
        if target_frame >= total_frames:
            target_frame = max(0, total_frames - 1)

        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()
        if not ret or frame is None:
            continue

        b64, img_bytes = _encode_frame(frame)
        if b64:
            sampled.append({
                "timestamp": ts,
                "base64_jpeg": b64,
                "image_bytes": img_bytes,
            })

    cap.release()
    return sampled
