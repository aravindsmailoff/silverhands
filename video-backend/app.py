import os
import sys
import uuid
import shutil
import subprocess
import threading
import json
import glob
import time
import asyncio
import urllib.parse
import urllib.request
from dotenv import load_dotenv

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Force stdout to utf-8 to prevent emoji crashes on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

load_dotenv()

UPLOAD_DIR = "uploads"
OUTPUT_DIR = "output"
SESSIONS_DIR = "sessions"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(SESSIONS_DIR, exist_ok=True)

app = FastAPI(title="Video AI - Core Backbone")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/videos/videos", StaticFiles(directory=OUTPUT_DIR), name="videos_fallback")
app.mount("/videos", StaticFiles(directory=OUTPUT_DIR), name="videos")
app.mount("/sessions", StaticFiles(directory=SESSIONS_DIR), name="sessions")

# In-memory queues and state
jobs = {}
analyzed_cache = {}
analyze_progress = {}
job_queue = asyncio.Queue()
concurrency_semaphore = asyncio.Semaphore(int(os.environ.get("MAX_CONCURRENT_JOBS", "2")))


def get_video_duration(video_path):
    try:
        cmd = [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration", "-of",
            "default=noprint_wrappers=1:nokey=1", video_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, check=True)
        return float(res.stdout.strip())
    except Exception:
        return 60.0

def _canonical_clip_file(output_dir, base_name, index):
    """Find the best-quality rendered file for a clip index."""
    pattern = os.path.join(output_dir, f"subtitled_*_{base_name}_clip_{index+1}.mp4")
    matches = glob.glob(pattern)
    if matches:
        return os.path.basename(matches[0])
    pattern_direct = os.path.join(output_dir, f"subtitled_*_clip_{index+1}.mp4")
    matches_direct = glob.glob(pattern_direct)
    if matches_direct:
        return os.path.basename(matches_direct[0])
    return f"{base_name}_clip_{index+1}.mp4"


def download_media(url: str, output_dir: str, target_filename: str = "source.mp4", session_id: str = None) -> str:
    """
    Downloads video from a YouTube URL, web video page, or direct file link.
    Guarantees that a valid video file exists at os.path.join(output_dir, target_filename).
    """
    url = url.strip()
    target_path = os.path.join(output_dir, target_filename)
    os.makedirs(output_dir, exist_ok=True)

    if session_id:
        analyze_progress[session_id] = {"progress": 12, "step": "Connecting to video stream..."}

    # If direct file URL (.mp4, .mov, etc.)
    parsed = urllib.parse.urlparse(url)
    path_lower = parsed.path.lower()
    if path_lower.endswith(('.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v')):
        print(f"📥 Direct media URL detected: {url}")
        if session_id:
            analyze_progress[session_id] = {"progress": 18, "step": "Downloading direct media file..."}
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        with urllib.request.urlopen(req, timeout=60) as resp, open(target_path, 'wb') as out_f:
            shutil.copyfileobj(resp, out_f)
        if os.path.exists(target_path) and os.path.getsize(target_path) > 1024:
            print(f"✅ Direct video downloaded ({os.path.getsize(target_path)} bytes): {target_path}")
            if session_id:
                analyze_progress[session_id] = {"progress": 25, "step": "Direct media download complete"}
            return target_path

    # Use main.py's battle-tested download_youtube_video
    if session_id:
        analyze_progress[session_id] = {"progress": 15, "step": "Downloading YouTube stream..."}
    from main import download_youtube_video
    dl_file, _ = download_youtube_video(url, output_dir)
    if os.path.exists(dl_file):
        if os.path.abspath(dl_file) != os.path.abspath(target_path):
            shutil.copy(dl_file, target_path)
        if session_id:
            analyze_progress[session_id] = {"progress": 28, "step": "Video download complete"}
        return target_path
    raise RuntimeError(f"Video file not found after download from {url}")


def _update_job_progress(job, line_str):
    """Calculates accurate percentage (0-100) and step description from stdout."""
    import re
    cur = job.get('progress', 5)
    step = job.get('current_step', 'Processing...')
    
    if 'Starting job' in line_str:
        cur, step = max(cur, 8), "Initializing video engine..."
    elif '[CACHE] Transcript loaded' in line_str or 'Transcribing' in line_str:
        cur, step = max(cur, 15), "Loading audio transcript..."
    elif '[CACHE] VUO loaded' in line_str:
        cur, step = max(cur, 20), "Loading video understanding..."
    elif 'Generating editorial plan' in line_str or 'Analyzing with SilverHands' in line_str:
        cur, step = max(cur, 26), "Designing editorial showcase plan..."
    elif 'Mapped' in line_str or 'Shortlisted' in line_str:
        cur, step = max(cur, 32), "Selecting key narrative beats..."
    elif 'Assembling' in line_str:
        cur, step = max(cur, 36), "Preparing showcase clips..."
    
    # Segment extraction progress (36% -> 56%)
    seg_match = re.search(r'Extracting segment\s+(\d+)/(\d+)', line_str)
    if seg_match:
        i, n = int(seg_match.group(1)), int(seg_match.group(2))
        pct = 36 + int((i / max(1, n)) * 20)
        cur, step = max(cur, pct), f"Extracting clip segment {i} of {n}..."

    if 'Applying J/L cut' in line_str or 'Intermediate Video assembled' in line_str:
        cur, step = max(cur, 58), "Blending audio J/L cuts & transitions..."
    elif 'Reframing assembled video' in line_str or 'Reframe engine v2' in line_str:
        cur, step = max(cur, 62), "Starting 9:16 vertical subject tracking..."

    # Scene reframing progress (62% -> 92%)
    scene_match = re.search(r'Analyzing Scenes:\s*(\d+)%', line_str)
    if scene_match:
        pct = int(scene_match.group(1))
        reframe_pct = 62 + int((pct / 100.0) * 30)
        cur, step = max(cur, reframe_pct), f"Reframing to 9:16 vertical ({pct}%)..."
    
    scene_frac = re.search(r'Analyzing Scenes:\s*.*?(\d+)/(\d+)', line_str)
    if scene_frac:
        i, n = int(scene_frac.group(1)), int(scene_frac.group(2))
        pct = int((i / max(1, n)) * 100)
        reframe_pct = 62 + int((pct / 100.0) * 30)
        cur, step = max(cur, reframe_pct), f"Reframing scene {i} of {n} ({pct}%)..."

    if 'Reframe v2 total' in line_str or 'Showcase ready' in line_str:
        cur, step = max(cur, 94), "Finalizing 9:16 vertical render..."
    elif 'Recorded version' in line_str:
        cur, step = max(cur, 98), "Saving version history..."
    elif 'Processing completed successfully' in line_str:
        cur, step = 100, "Rendering complete!"

    job['progress'] = cur
    job['current_step'] = step


def sync_run_job(job_id, cmd, env):
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        text=True,
        encoding='utf-8',
        errors='replace',
        bufsize=1
    )
    for line in process.stdout:
        line_str = line.strip()
        if line_str:
            jobs[job_id]['logs'].append(line_str)
            _update_job_progress(jobs[job_id], line_str)
            print(f"[{job_id}] ({jobs[job_id]['progress']}%) {line_str}")
    process.wait()
    return process.returncode

async def run_job(job_id, job_info):
    cmd = job_info['cmd']
    env = job_info['env']
    output_dir = job_info['output_dir']
    session_id = job_info.get('session_id')
    
    jobs[job_id]['status'] = 'running'
    jobs[job_id]['progress'] = 5
    jobs[job_id]['current_step'] = "Starting video generation..."
    jobs[job_id]['logs'].append(f"Starting job {job_id}...")
    
    try:
        loop = asyncio.get_event_loop()
        returncode = await loop.run_in_executor(None, sync_run_job, job_id, cmd, env)
        
        if returncode == 0:
            jobs[job_id]['status'] = 'completed'
            jobs[job_id]['progress'] = 100
            jobs[job_id]['current_step'] = "Complete!"
            jobs[job_id]['logs'].append("Processing completed successfully.")
            
            # Locate output metadata
            json_files = glob.glob(os.path.join(output_dir, "*_metadata.json"))
            if json_files:
                target_json = json_files[0] 
                with open(target_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                base_name = os.path.basename(target_json).replace('_metadata.json', '')
                clips = data.get('shorts', [])

                for i, clip in enumerate(clips):
                     clip_filename = _canonical_clip_file(output_dir, base_name, i)
                     clip['video_url'] = f"/videos/{job_id}/{clip_filename}"
                
                import session_manager
                history = session_manager.get_session_history(session_id) if session_id else []
                jobs[job_id]['result'] = {
                    'clips': clips,
                    'session_id': session_id,
                    'versions': history
                }
            else:
                 jobs[job_id]['status'] = 'failed'
                 jobs[job_id]['logs'].append("No metadata file generated.")
        else:
            jobs[job_id]['status'] = 'failed'
            jobs[job_id]['logs'].append(f"Process failed with exit code {returncode}")
            
    except Exception as e:
        import traceback
        jobs[job_id]['status'] = 'failed'
        jobs[job_id]['logs'].append(f"Internal Error: {repr(e)}\n{traceback.format_exc()}")
    finally:
        concurrency_semaphore.release()
        job_queue.task_done()

async def process_queue():
    while True:
        job_id = await job_queue.get()
        await concurrency_semaphore.acquire()
        asyncio.create_task(run_job_wrapper(job_id))

async def run_job_wrapper(job_id):
    try:
        job = jobs.get(job_id)
        if job:
            await run_job(job_id, job)
    except Exception as e:
         print(f"Job wrapper error {job_id}: {e}")
         concurrency_semaphore.release()
         job_queue.task_done()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(process_queue())


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "gemini_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "service": "SilverHands AI Video Backend"
    }


@app.post("/api/analyze")
async def analyze_endpoint(
    url: str = Form(None),
    file: UploadFile = File(None),
    session_id: str = Form(None)
):
    """
    Phase 1: Transcribe + understand video (Done ONCE per session).
    Returns structured Video Understanding Object (VUO) with focus suggestions and persistent session_id.
    """
    import session_manager
    if session_id:
        cached_mem = session_manager.load_session_memory(session_id)
        if cached_mem:
            print(f"⚡ [SESSION] Returning existing video memory for session {session_id}")
            return {
                "session_id": session_id,
                "analyze_id": session_id,
                "subject": cached_mem["vuo"].get("subject", "Video Skill Showcase"),
                "provider_skill": cached_mem["vuo"].get("provider_skill", "Craftsmanship & Service"),
                "suggestions": cached_mem["vuo"].get("detected_topics", []),
                "has_clear_result": cached_mem["vuo"].get("has_clear_result", True),
                "language": cached_mem["vuo"].get("language", "en"),
                "duration": cached_mem["duration"],
                "content_mode": cached_mem["content_mode"],
                "versions": session_manager.get_session_history(session_id)
            }

    if not url and not file:
        raise HTTPException(status_code=400, detail="Provide a YouTube URL or upload a video file.")

    # Create new persistent session ID
    sid = session_id or uuid.uuid4().hex[:10]
    session_dir = session_manager.get_session_dir(sid)
    input_path = os.path.join(session_dir, "source.mp4")
    loop = asyncio.get_event_loop()

    analyze_progress[sid] = {"progress": 10, "step": "Acquiring source video..."}

    if file:
        analyze_progress[sid] = {"progress": 15, "step": "Uploading video file..."}
        with open(input_path, "wb") as buffer:
            buffer.write(await file.read())
        analyze_progress[sid] = {"progress": 28, "step": "Video uploaded successfully"}
    elif url:
        try:
            await loop.run_in_executor(None, download_media, url.strip(), session_dir, "source.mp4", sid)
        except Exception as yt_err:
            analyze_progress[sid] = {"progress": 0, "step": "Download failed"}
            raise HTTPException(
                status_code=400,
                detail=f"Video could not be downloaded: {str(yt_err).splitlines()[-1]}"
            )

    if not os.path.exists(input_path) or os.path.getsize(input_path) < 100:
        analyze_progress[sid] = {"progress": 0, "step": "Failed to acquire source video"}
        raise HTTPException(status_code=400, detail="Failed to acquire source video. Please check the URL or upload a video file.")

    try:
        print(f"🎬 [SESSION {sid}] Extracting one-time video memory...")
        analyze_progress[sid] = {"progress": 32, "step": "Transcribing speech & audio with AI..."}

        # 1. Transcribe
        import transcribe_backends
        transcript = await loop.run_in_executor(
            None, transcribe_backends.transcribe_media, input_path
        )
        duration = get_video_duration(input_path)

        analyze_progress[sid] = {"progress": 58, "step": "Detecting scene cuts & visual boundaries..."}

        # 2. Scene detection
        import scene_detection
        scene_cuts = []
        try:
            scenes_res = await loop.run_in_executor(None, scene_detection.detect_scenes, input_path)
            for s, _ in scenes_res[0]:
                if hasattr(s, 'get_seconds'):
                    scene_cuts.append(s.get_seconds())
        except Exception as e:
            print(f"⚠️ [SESSION {sid}] Scene detection warning: {e}")

        analyze_progress[sid] = {"progress": 78, "step": "Extracting topics & visual beats with Gemini..."}

        # 3. Analyze with Gemini Video Understanding (with automatic offline fallback)
        from google import genai
        import gemini_worker
        api_key = os.environ.get("GEMINI_API_KEY")
        client = genai.Client(api_key=api_key) if api_key else None
        model_name = os.environ.get("GEMINI_MODEL") or 'gemini-3.1-flash-lite'
        
        vuo, cost = await loop.run_in_executor(
            None, gemini_worker.analyze_video_understanding, client, model_name, transcript, duration, input_path
        )

        analyze_progress[sid] = {"progress": 95, "step": "Saving persistent video memory..."}

        # 4. Save video memory into session
        session_manager.save_session_memory(sid, input_path, duration, transcript, vuo, scene_cuts)

        # 5. Cache legacy analyze_id for compatibility
        cache_data = {
            "analyze_id": sid,
            "session_id": sid,
            "input_path": input_path,
            "duration": duration,
            "transcript": transcript,
            "vuo": vuo
        }
        analyzed_cache[sid] = cache_data
        analyze_progress[sid] = {"progress": 100, "step": "Video memory extracted successfully!"}

        return {
            "session_id": sid,
            "analyze_id": sid,
            "subject": vuo.get("subject", "Video Skill Showcase"),
            "provider_skill": vuo.get("provider_skill", "Craftsmanship & Service"),
            "suggestions": vuo.get("detected_topics", []),
            "has_clear_result": vuo.get("has_clear_result", True),
            "language": vuo.get("language", "en"),
            "duration": duration,
            "content_mode": vuo.get("content_mode", "speech"),
            "versions": []
        }

    except Exception as e:
        analyze_progress[sid] = {"progress": 0, "step": f"Analysis failed: {str(e)}"}
        print(f"❌ /api/analyze error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/api/analyze/status/{session_id}")
async def get_analyze_status(session_id: str):
    """Retrieve progress percentage and current step for active video analysis."""
    return analyze_progress.get(session_id, {
        "progress": 0,
        "step": "Initializing analysis...",
        "stage": "analyzing"
    })


@app.post("/api/process")
async def process_endpoint(
    request: Request,
    url: str = Form(None),
    file: UploadFile = File(None),
    analyze_id: str = Form(None),
    session_id: str = Form(None),
    focus: str = Form(""),
    mode: str = Form("highlight"),
    silverhands: bool = Form(True)
):
    sid = session_id or analyze_id
    if not url and not file and not sid:
        raise HTTPException(status_code=400, detail="Provide a video file, YouTube URL, or session_id.")
    
    api_key = os.environ.get("GEMINI_API_KEY", "")

    job_id = str(uuid.uuid4())
    job_output_dir = os.path.join(OUTPUT_DIR, job_id)
    os.makedirs(job_output_dir, exist_ok=True)
    
    cmd = [
        sys.executable, "main.py",
        "--output", job_output_dir
    ]

    import session_manager
    if sid and session_manager.load_session_memory(sid):
        # Use session ID directly to reuse cached video memory!
        cmd.extend(["--session-id", sid])
    elif sid and sid in analyzed_cache:
        input_path = analyzed_cache[sid]["input_path"]
        cmd.extend(["--input", input_path])
    elif file:
        input_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")
        with open(input_path, "wb") as buffer:
            buffer.write(await file.read())
        cmd.extend(["--input", input_path])
    elif url:
        cmd.extend(["--url", url.strip()])
        
    if silverhands:
        cmd.append("--silverhands")
        cmd.extend(["--mode", mode])
        if focus:
            cmd.extend(["--focus", focus])
        
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUNBUFFERED"] = "1"
    if api_key:
        env["GEMINI_API_KEY"] = api_key
    
    jobs[job_id] = {
        "job_id": job_id,
        "session_id": sid,
        "status": "pending",
        "progress": 0,
        "current_step": "Job queued in background...",
        "logs": ["Job created. Waiting in queue..."],
        "result": None,
        "cmd": cmd,
        "env": env,
        "output_dir": job_output_dir
    }
    
    await job_queue.put(job_id)
    return {"job_id": job_id, "session_id": sid, "message": "Job added to queue"}


@app.get("/api/session/{session_id}")
async def get_session_endpoint(session_id: str):
    """Retrieve full video memory and version history for a session."""
    import session_manager
    mem = session_manager.load_session_memory(session_id)
    if not mem:
        raise HTTPException(status_code=404, detail="Session not found")
    versions = session_manager.get_session_history(session_id)
    return {
        "session_id": session_id,
        "subject": mem["vuo"].get("subject", ""),
        "provider_skill": mem["vuo"].get("provider_skill", ""),
        "suggestions": mem["vuo"].get("detected_topics", []),
        "duration": mem["duration"],
        "content_mode": mem["content_mode"],
        "versions": versions
    }


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    return {
        "job_id": job_id,
        "session_id": job.get("session_id"),
        "status": job["status"],
        "progress": job.get("progress", 0 if job["status"] == "pending" else (100 if job["status"] == "completed" else 5)),
        "current_step": job.get("current_step", "Processing..."),
        "logs": job["logs"],
        "result": job["result"]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
