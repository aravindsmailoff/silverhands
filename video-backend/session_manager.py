"""
session_manager.py - Persistent Video Memory & Versioned Iteration Engine
========================================================================
Separates Video Processing into 3 Distinct Layers:
1. VIDEO MEMORY (Expensive, done once on upload / analyze):
   - Transcription (Whisper / Parakeet)
   - Scene detection (TransNetV2)
   - Gemini VUO (Video Understanding Object + visual beats + topics)
   - Saved under sessions/<session_id>/

2. EDITORIAL PLAN (Fast, repeatable per user focus):
   - Generates plan_001.json, plan_002.json, plan_003.json based on focus instructions
   - Reuses cached video memory without re-transcribing or re-analyzing

3. RENDER (Fast, repeatable):
   - Assembles and reframes version_001.mp4, version_002.mp4, etc.
   - Preserves all historical versions for user comparison and retrieval
"""

import os
import sys
import json
import time
import uuid
import glob
import shutil
from typing import Dict, Any, Optional, List, Tuple

SESSIONS_DIR = os.path.abspath("sessions")
os.makedirs(SESSIONS_DIR, exist_ok=True)


def get_session_dir(session_id: str) -> str:
    """Return the absolute path to a session's directory."""
    s_dir = os.path.join(SESSIONS_DIR, session_id)
    os.makedirs(s_dir, exist_ok=True)
    os.makedirs(os.path.join(s_dir, "plans"), exist_ok=True)
    os.makedirs(os.path.join(s_dir, "renders"), exist_ok=True)
    return s_dir


def get_next_version_number(session_id: str) -> int:
    """Find the next sequential version number (1, 2, 3, ...) for this session."""
    s_dir = get_session_dir(session_id)
    plan_files = glob.glob(os.path.join(s_dir, "plans", "plan_*.json"))
    render_files = glob.glob(os.path.join(s_dir, "renders", "version_*.mp4"))
    
    max_v = 0
    for p in plan_files + render_files:
        base = os.path.basename(p)
        # Extract number from plan_001.json or version_001.mp4
        digits = "".join([c for c in base if c.isdigit()])
        if digits:
            try:
                v = int(digits)
                if v > max_v:
                    max_v = v
            except ValueError:
                pass
    return max_v + 1


def load_session_memory(session_id: str) -> Optional[Dict[str, Any]]:
    """
    Load cached video memory (transcript, VUO, scenes, duration, source path) for a session.
    Returns None if the session memory has not been computed yet.
    """
    s_dir = get_session_dir(session_id)
    transcript_path = os.path.join(s_dir, "transcript.json")
    vuo_path = os.path.join(s_dir, "vuo.json")
    scenes_path = os.path.join(s_dir, "scenes.json")
    analysis_path = os.path.join(s_dir, "analysis.json")
    source_path = os.path.join(s_dir, "source.mp4")

    if not (os.path.exists(transcript_path) and os.path.exists(vuo_path) and os.path.exists(scenes_path)):
        return None

    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            transcript = json.load(f)
        print(f"⚡ [CACHE] Transcript loaded for session {session_id}")

        with open(vuo_path, "r", encoding="utf-8") as f:
            vuo = json.load(f)
        print(f"⚡ [CACHE] VUO loaded for session {session_id}")

        with open(scenes_path, "r", encoding="utf-8") as f:
            scenes = json.load(f)
        print(f"⚡ [CACHE] Scene analysis loaded for session {session_id}")

        analysis = {}
        if os.path.exists(analysis_path):
            with open(analysis_path, "r", encoding="utf-8") as f:
                analysis = json.load(f)

        return {
            "session_id": session_id,
            "session_dir": s_dir,
            "source_path": source_path if os.path.exists(source_path) else analysis.get("source_path"),
            "duration": analysis.get("duration", 60.0),
            "transcript": transcript,
            "vuo": vuo,
            "scenes": scenes,
            "analysis": analysis,
            "content_mode": vuo.get("content_mode", "speech")
        }
    except Exception as e:
        print(f"⚠️ [session_manager] Error reading session {session_id}: {e}")
        return None


def save_session_memory(
    session_id: str,
    source_path: str,
    duration: float,
    transcript: dict,
    vuo: dict,
    scenes: list
) -> Dict[str, Any]:
    """
    Persist one-time video memory (transcript, VUO, scenes, analysis) into session directory.
    """
    s_dir = get_session_dir(session_id)
    session_source = os.path.join(s_dir, "source.mp4")

    # If source_path is different from session_source, copy or link it
    if os.path.exists(source_path) and os.path.abspath(source_path) != os.path.abspath(session_source):
        try:
            shutil.copy2(source_path, session_source)
        except Exception as e:
            print(f"⚠️ [session_manager] Could not copy source to session dir ({e}); using original path.")
            session_source = source_path

    # Save transcript
    with open(os.path.join(s_dir, "transcript.json"), "w", encoding="utf-8") as f:
        json.dump(transcript, f, ensure_ascii=False, indent=2)

    # Save VUO
    with open(os.path.join(s_dir, "vuo.json"), "w", encoding="utf-8") as f:
        json.dump(vuo, f, ensure_ascii=False, indent=2)

    # Save scenes (list of cut times in seconds)
    with open(os.path.join(s_dir, "scenes.json"), "w", encoding="utf-8") as f:
        json.dump(scenes, f, ensure_ascii=False, indent=2)

    # Save summary analysis
    analysis_data = {
        "session_id": session_id,
        "source_path": session_source,
        "duration": duration,
        "content_mode": vuo.get("content_mode", "speech"),
        "subject": vuo.get("subject", "Video Skill Showcase"),
        "provider_skill": vuo.get("provider_skill", "Craftsmanship & Service"),
        "created_at": time.time()
    }
    with open(os.path.join(s_dir, "analysis.json"), "w", encoding="utf-8") as f:
        json.dump(analysis_data, f, ensure_ascii=False, indent=2)

    print(f"✅ [session_manager] Saved video memory for session {session_id}")
    return analysis_data


def record_session_version(
    session_id: str,
    version_num: int,
    focus: str,
    plan_data: dict,
    rendered_video_path: str,
    duration: float
) -> Dict[str, Any]:
    """
    Save editorial plan and update session_metadata.json with the new version.
    """
    s_dir = get_session_dir(session_id)
    plan_filename = f"plan_{version_num:03d}.json"
    render_filename = f"version_{version_num:03d}.mp4"

    plan_path = os.path.join(s_dir, "plans", plan_filename)
    dest_render_path = os.path.join(s_dir, "renders", render_filename)

    # Write plan JSON
    with open(plan_path, "w", encoding="utf-8") as f:
        json.dump(plan_data, f, ensure_ascii=False, indent=2)

    # Copy rendered video to session renders if at another path
    if os.path.exists(rendered_video_path) and os.path.abspath(rendered_video_path) != os.path.abspath(dest_render_path):
        try:
            shutil.copy2(rendered_video_path, dest_render_path)
        except Exception as e:
            print(f"⚠️ [session_manager] Could not copy render to session dir: {e}")

    # Update metadata
    meta_path = os.path.join(s_dir, "session_metadata.json")
    meta = {"session_id": session_id, "versions": []}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            pass

    version_record = {
        "version": version_num,
        "focus": focus or "Default Highlights",
        "title": plan_data.get("showcase_title", f"Showcase v{version_num}"),
        "plan_file": f"plans/{plan_filename}",
        "render_file": f"renders/{render_filename}",
        "video_url": f"/sessions/{session_id}/renders/{render_filename}",
        "duration": duration,
        "segment_count": len(plan_data.get("segments", [])),
        "created_at": time.time()
    }

    # Append or replace version record
    meta["versions"] = [v for v in meta.get("versions", []) if v.get("version") != version_num]
    meta["versions"].append(version_record)
    meta["current_version"] = version_num

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"💾 [session_manager] Recorded version {version_num} for session {session_id}")
    return version_record


def get_session_history(session_id: str) -> List[Dict[str, Any]]:
    """Return all historical versions generated for a session."""
    s_dir = get_session_dir(session_id)
    meta_path = os.path.join(s_dir, "session_metadata.json")
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
                return meta.get("versions", [])
        except Exception:
            pass
    return []
