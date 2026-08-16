'use client';

import React, {
  useState, useRef, useEffect, useCallback,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSavedProfile } from '@/lib/voice-agent';
import {
  detectBothThumbs, detectTshape, detectBothOpenShaking,
  pushShakeHistory, ShakeHistory,
} from '@/lib/gesture-detector';
import {
  Video, Upload, ArrowLeft, Sparkles, Square, RotateCcw,
  Save, Download, Play, Pause, CheckCircle, Loader2,
  MonitorPlay, Scissors, BookOpen, Zap, ChevronRight,
  AlertTriangle, Camera,
} from 'lucide-react';

declare global { interface Window { Hands: any; } }

// ── Stage type ────────────────────────────────────────────────────────────────
type Stage =
  | 'choose'           // Stage 0
  | 'record'           // Stage 1A
  | 'upload'           // Stage 1B
  | 'confirm'          // Stage 2 – source ready, uploading to vediomodel
  | 'output-choose'    // Stage 3 – pick mode, trigger processing
  | 'processing'       // Stage 3b – polling job status
  | 'preview';         // Stage 4 – view generated clips

type RecordState = 'idle' | 'countdown' | 'recording' | 'paused' | 'done';

const VIDEO_MODES = [
  { id: 'highlight', label: 'Highlight Reel', icon: Zap,         desc: 'Best viral moments auto-selected' },
  { id: 'tutorial',  label: 'Tutorial',       icon: BookOpen,    desc: 'Step-by-step teaching clips' },
  { id: 'story',     label: 'Story',          icon: MonitorPlay, desc: 'Narrative arc short' },
  { id: 'auto',      label: 'AI Decides',     icon: Sparkles,    desc: 'Gemini picks the best format' },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function CreateVideoPage() {
  const router = useRouter();

  // ── Stage ─────────────────────────────────────────────────────────────────
  const [stage, setStage]             = useState<Stage>('choose');

  // ── Record state ──────────────────────────────────────────────────────────
  const [recordState, setRecordState] = useState<RecordState>('idle');
  const [countdown, setCountdown]     = useState(3);
  const [seconds, setSeconds]         = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [gestureReady, setGestureReady] = useState(false);
  const [gestureHint, setGestureHint] = useState('');
  const [cameraError, setCameraError] = useState('');

  // ── Source video ──────────────────────────────────────────────────────────
  const [sourceBlob, setSourceBlob]   = useState<Blob | null>(null);
  const [sourceUrl, setSourceUrl]     = useState<string | null>(null);
  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [isDragOver, setIsDragOver]   = useState(false);

  // ── Vediomodel pipeline ───────────────────────────────────────────────────
  const [sessionId, setSessionId]     = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [subject, setSubject]         = useState('');
  const [selectedMode, setSelectedMode] = useState('highlight');
  const [focusTopic, setFocusTopic]   = useState('');
  const [jobId, setJobId]             = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState(0);
  const [jobStep, setJobStep]         = useState('');
  const [jobError, setJobError]       = useState('');

  // ── Output clips ──────────────────────────────────────────────────────────
  const [clips, setClips]             = useState<any[]>([]);
  const [activeClip, setActiveClip]   = useState(0);
  const [isSaving, setIsSaving]       = useState(false);
  const [saved, setSaved]             = useState(false);

  // ── Analyze progress ──────────────────────────────────────────────────────
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeStep, setAnalyzeStep]  = useState('');
  const [analyzeError, setAnalyzeError] = useState('');

  // ── Refs ──────────────────────────────────────────────────────────────────
  const videoRef      = useRef<HTMLVideoElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const timerRef      = useRef<any>(null);
  const rafRef        = useRef<number | null>(null);
  const handsRef      = useRef<any>(null);
  const lastGestureRef = useRef(0);
  const recordStateRef = useRef<RecordState>('idle');
  const shakeHistRef  = useRef<ShakeHistory[]>([]);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const pollRef       = useRef<any>(null);

  useEffect(() => { recordStateRef.current = recordState; }, [recordState]);

  // ─── Recording timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (recordState === 'recording') {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [recordState]);

  // ─── Boot camera + MediaPipe (only when entering record stage) ────────────
  useEffect(() => {
    if (stage !== 'record') return;
    let alive = true;

    (async () => {
      // 1. Request camera permission
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      } catch {
        if (alive) setCameraError('Camera access denied. Please allow camera permissions and reload.');
        return;
      }

      // 2. Load MediaPipe Hands
      try {
        const load = (src: string) => new Promise<void>(ok => {
          if (document.querySelector(`script[src="${src}"]`)) { ok(); return; }
          const s = document.createElement('script');
          s.src = src; s.crossOrigin = 'anonymous';
          s.onload = () => ok(); s.onerror = () => ok();
          document.body.appendChild(s);
        });
        await load('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
        if (!alive || !window.Hands) return;

        const hands = new window.Hands({
          locateFile: (f: string) => f.startsWith('http') ? f : `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.65, minTrackingConfidence: 0.55 });
        hands.onResults(onHandResults);
        await hands.initialize();
        handsRef.current = hands;
        lastGestureRef.current = Date.now() + 3000; // 3s warm-up
        setTimeout(() => { if (alive) setGestureReady(true); }, 3200);
        startRAFLoop();
      } catch (e) {
        console.warn('MediaPipe warning:', e);
      }
    })();

    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ─── RAF loop ─────────────────────────────────────────────────────────────
  const startRAFLoop = useCallback(() => {
    if (!canvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 240;
      canvasRef.current = c;
    }
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const loop = async () => {
      if (videoRef.current && videoRef.current.readyState >= 2 && handsRef.current) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        try { await handsRef.current.send({ image: canvas }); } catch (_) {}
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ─── Gesture handler ──────────────────────────────────────────────────────
  const onHandResults = useCallback((results: any) => {
    const now = Date.now();
    if (now < lastGestureRef.current) return;

    // Update shake history every frame
    shakeHistRef.current = pushShakeHistory(results, shakeHistRef.current);

    const rs = recordStateRef.current;

    // BOTH THUMBS UP → start (only when idle)
    if (rs === 'idle' && detectBothThumbs(results)) {
      lastGestureRef.current = now + 2000;
      setGestureHint('👍 Both thumbs up — starting in 3…');
      startCountdown();
      return;
    }

    // T-SHAPE → pause / resume (only while recording or paused)
    if ((rs === 'recording' || rs === 'paused') && detectTshape(results)) {
      lastGestureRef.current = now + 2000;
      if (rs === 'recording') { pauseRecording(); setGestureHint('⏸ Paused'); }
      else                    { resumeRecording(); setGestureHint('▶ Resumed'); }
      setTimeout(() => setGestureHint(''), 2000);
      return;
    }

    // BOTH OPEN PALMS + SHAKE → stop
    if ((rs === 'recording' || rs === 'paused') && detectBothOpenShaking(results, shakeHistRef.current)) {
      lastGestureRef.current = now + 3000;
      setGestureHint('🛑 Stopping…');
      stopRecording();
      return;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 3-2-1 Countdown ─────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    setRecordState('countdown');
    setCountdown(3);
    let n = 3;
    const iv = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(iv);
        beginRecording();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }, []); // eslint-disable-line

  // ─── Begin actual recording ───────────────────────────────────────────────
  const beginRecording = useCallback(() => {
    if (!streamRef.current) return;
    setRecordedState('idle'); // reset seconds
    setSeconds(0);
    chunksRef.current = [];

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : '';
    const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      setSourceBlob(blob);
      setSourceUrl(URL.createObjectURL(blob));
      setRecordState('done');
      setGestureHint('');
      // Stop camera tracks
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    rec.start(200);
    recorderRef.current = rec;
    setRecordState('recording');
    setGestureHint('🔴 Recording — show T-shape to pause, both open palms + shake to stop');
    setTimeout(() => setGestureHint(''), 4000);
  }, []);

  // Helper to avoid lint errors
  const setRecordedState = (s: RecordState) => setRecordState(s);

  const pauseRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      setRecordState('paused');
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      setRecordState('recording');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecordState('done');
  }, []);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ─── Upload file handling ─────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('video/')) return;
    setUploadFile(file);
    setSourceBlob(file);
    setSourceUrl(URL.createObjectURL(file));
  };

  // ─── Stage 2: Analyze source video via vediomodel ────────────────────────
  const handleAnalyze = async () => {
    setStage('confirm');
    setAnalyzeProgress(5);
    setAnalyzeStep('Preparing video…');
    setAnalyzeError('');

    try {
      const blob = sourceBlob!;
      const fd = new FormData();
      fd.append('file', blob, uploadFile?.name || 'recorded.webm');

      setAnalyzeProgress(15);
      setAnalyzeStep('Uploading to AI pipeline…');

      // Poll analyze status while waiting
      let statusPollId: any = null;
      const resp = fetch('/api/videomodel/analyze', { method: 'POST', body: fd });

      // Simulate progress while waiting for the long analyze call
      let fakePct = 15;
      statusPollId = setInterval(() => {
        fakePct = Math.min(fakePct + 3, 88);
        setAnalyzeProgress(fakePct);
      }, 1000);

      const r = await resp;
      clearInterval(statusPollId);

      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const data = await r.json();
      setSessionId(data.session_id);
      // vediomodel returns suggestions as objects {id,title,...} or strings — normalise both
      const rawSuggestions: any[] = data.suggestions || [];
      const normSuggestions: string[] = rawSuggestions.map((s: any) =>
        typeof s === 'string' ? s : (s.title || s.description || s.id || JSON.stringify(s))
      );
      setSuggestions(normSuggestions);
      setSubject(data.subject || '');
      setFocusTopic(normSuggestions[0] || '');
      setAnalyzeProgress(100);
      setAnalyzeStep('Analysis complete!');
      await new Promise(r => setTimeout(r, 600));
      setStage('output-choose');
    } catch (err: any) {
      setAnalyzeError(err.message || 'Analysis failed. Is the video backend running?');
      setAnalyzeProgress(0);
    }
  };

  // ─── Stage 3: Submit processing job ──────────────────────────────────────
  const handleProcess = async () => {
    if (!sessionId) return;
    setStage('processing');
    setJobProgress(0);
    setJobStep('Submitting job…');
    setJobError('');

    try {
      const r = await fetch('/api/videomodel/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, mode: selectedMode, focus: focusTopic }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Could not start processing');
      setJobId(data.job_id);
      pollJobStatus(data.job_id);
    } catch (err: any) {
      setJobError(err.message);
    }
  };

  const pollJobStatus = useCallback((jId: string) => {
    let attempts = 0;
    const MAX = 180; // 6 min at 2s intervals
    const poll = async () => {
      if (attempts++ > MAX) { setJobError('Processing timed out. Try again.'); return; }
      try {
        const r = await fetch(`/api/videomodel/status/${jId}`);
        const data = await r.json();
        setJobProgress(data.progress || 0);
        setJobStep(data.current_step || 'Processing…');

        if (data.status === 'completed' && data.result?.clips) {
          setClips(data.result.clips);
          setStage('preview');
          return;
        }
        if (data.status === 'failed') {
          setJobError('Processing failed. ' + (data.logs?.slice(-1)?.[0] || ''));
          return;
        }
      } catch { /* network glitch, keep polling */ }
      pollRef.current = setTimeout(poll, 2000);
    };
    poll();
  }, []);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  // ─── Save generated clip to DB ────────────────────────────────────────────
  const handleSave = async () => {
    const clip = clips[activeClip];
    if (!clip) return;
    setIsSaving(true);
    try {
      const profile = getSavedProfile();
      await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: clip.title || subject || 'SilverHands Video',
          description: clip.hook_text || clip.title || '',
          videoUrl: clip.video_url || '',
          creatorName: profile?.name,
        }),
      });
      setSaved(true);
    } catch { /* silent */ }
    setIsSaving(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  //  UI
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0f1e] via-[#0d1b3e] to-[#031635] text-white"
      style={{ fontFamily: "'Lexend', sans-serif" }}>

      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-md bg-white/5">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#FDBC13] rounded-2xl flex items-center justify-center text-xl shadow-lg">🤝</div>
            <div>
              <span className="font-black text-xl text-white block">SilverHands</span>
              <span className="text-xs font-semibold text-[#FDBC13]">Video Studio</span>
            </div>
          </Link>
          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-bold text-white transition border border-white/10">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">

        {/* ── Stage 0: Choose ──────────────────────────────────────────────── */}
        {stage === 'choose' && (
          <div className="space-y-10">
            <div className="text-center space-y-3">
              <h1 className="text-5xl font-black text-white">🎬 Create Your Video</h1>
              <p className="text-xl text-white/60 font-medium">How would you like to start?</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Record */}
              <button onClick={() => setStage('record')}
                className="group relative p-10 bg-gradient-to-br from-emerald-600/30 to-emerald-800/20 border-2 border-emerald-500/40 hover:border-emerald-400 rounded-3xl text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald-500/20">
                <div className="text-6xl mb-6">🎥</div>
                <h2 className="text-2xl font-black text-white mb-2">Record a Video</h2>
                <p className="text-white/60 font-medium leading-relaxed">Use your camera with gesture controls. Hands-free recording designed for creators.</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['👍👍 Start', '⏸ Pause', '🖐🖐 Stop'].map(g => (
                    <span key={g} className="px-3 py-1 bg-emerald-500/20 rounded-full text-xs font-bold text-emerald-300 border border-emerald-500/30">{g}</span>
                  ))}
                </div>
                <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 text-emerald-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>

              {/* Upload */}
              <button onClick={() => setStage('upload')}
                className="group relative p-10 bg-gradient-to-br from-violet-600/30 to-violet-800/20 border-2 border-violet-500/40 hover:border-violet-400 rounded-3xl text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-violet-500/20">
                <div className="text-6xl mb-6">📁</div>
                <h2 className="text-2xl font-black text-white mb-2">Upload a Video</h2>
                <p className="text-white/60 font-medium leading-relaxed">Choose an existing video from your device. We&apos;ll handle the rest with AI.</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {['MP4', 'MOV', 'WEBM', 'AVI'].map(f => (
                    <span key={f} className="px-3 py-1 bg-violet-500/20 rounded-full text-xs font-bold text-violet-300 border border-violet-500/30">{f}</span>
                  ))}
                </div>
                <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 w-8 h-8 text-violet-400 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </div>
        )}

        {/* ── Stage 1A: Record ─────────────────────────────────────────────── */}
        {stage === 'record' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <button onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); setStage('choose'); }}
                className="p-2 hover:bg-white/10 rounded-xl transition"><ArrowLeft className="w-5 h-5" /></button>
              <h1 className="text-3xl font-black">🎥 Record Your Video</h1>
            </div>

            {cameraError && (
              <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl flex items-center gap-3 text-rose-300 font-semibold">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" /> {cameraError}
              </div>
            )}

            {/* Camera viewport */}
            <div className="relative w-full rounded-3xl overflow-hidden border-2 shadow-2xl"
              style={{
                aspectRatio: '16/9',
                background: '#0a0f1e',
                borderColor: recordState === 'recording' ? '#dc2626'
                           : recordState === 'paused'    ? '#f59e0b'
                           : '#334155',
              }}>
              <video ref={videoRef} autoPlay playsInline muted
                className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />

              {/* Top-left status pill */}
              <div className="absolute top-4 left-4 z-20">
                {!cameraReady ? (
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm font-bold animate-pulse flex items-center gap-2">
                    <Camera className="w-4 h-4" /> Activating camera…
                  </div>
                ) : !gestureReady ? (
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm font-bold animate-pulse">
                    ⏳ Loading gesture AI…
                  </div>
                ) : recordState === 'idle' ? (
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm font-bold">
                    👍👍 Show Both Thumbs Up to Start
                  </div>
                ) : null}
              </div>

              {/* Timer top-right */}
              {(recordState === 'recording' || recordState === 'paused') && (
                <div className={`absolute top-4 right-4 z-20 px-4 py-2 rounded-full text-lg font-black shadow-lg ${
                  recordState === 'paused' ? 'bg-amber-500 text-black' : 'bg-rose-600 text-white animate-pulse'
                }`}>
                  {recordState === 'paused' ? '⏸' : '🔴'} {fmt(seconds)}
                </div>
              )}

              {/* 3-2-1 Countdown overlay */}
              {recordState === 'countdown' && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-30">
                  <div className="text-[10rem] font-black text-[#FDBC13] leading-none animate-bounce">{countdown}</div>
                  <div className="text-2xl font-bold text-white mt-4">Get ready…</div>
                </div>
              )}

              {/* Recording hint bottom */}
              {gestureHint && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20">
                  <div className="bg-black/80 text-white px-5 py-2 rounded-full text-sm font-bold backdrop-blur-sm">
                    {gestureHint}
                  </div>
                </div>
              )}

              {/* Pause overlay */}
              {recordState === 'paused' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 pointer-events-none">
                  <div className="text-6xl font-black text-amber-400">⏸ PAUSED</div>
                </div>
              )}
            </div>

            {/* Gesture guide */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { emoji: '👍👍', label: 'Both Thumbs Up', action: 'Start Recording', color: 'emerald' },
                { emoji: '🤚', label: 'T-Shape Hands', action: 'Pause / Resume', color: 'amber' },
                { emoji: '🖐🖐', label: 'Both Palms + Shake', action: 'Stop & Finalise', color: 'rose' },
              ].map(g => (
                <div key={g.label} className={`p-4 rounded-2xl bg-${g.color}-500/10 border border-${g.color}-500/20 text-center`}>
                  <div className="text-3xl mb-2">{g.emoji}</div>
                  <div className="text-xs font-bold text-white/80">{g.label}</div>
                  <div className={`text-xs font-semibold text-${g.color}-400 mt-1`}>{g.action}</div>
                </div>
              ))}
            </div>

            {/* Manual fallback buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button onClick={startCountdown}
                disabled={recordState !== 'idle' || !cameraReady}
                className="py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition">
                <Video className="w-5 h-5" /> Start
              </button>
              <button onClick={recordState === 'paused' ? resumeRecording : pauseRecording}
                disabled={recordState !== 'recording' && recordState !== 'paused'}
                className="py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 text-black font-black rounded-2xl flex items-center justify-center gap-2 transition">
                {recordState === 'paused' ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                {recordState === 'paused' ? 'Resume' : 'Pause'}
              </button>
              <button onClick={stopRecording}
                disabled={recordState !== 'recording' && recordState !== 'paused'}
                className="py-4 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition">
                <Square className="w-5 h-5 fill-white" /> Stop
              </button>
            </div>

            {/* Recorded — proceed */}
            {recordState === 'done' && sourceUrl && (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/40 rounded-2xl flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-emerald-400" />
                  <span className="font-bold text-emerald-300">Video recorded successfully! Review it below.</span>
                </div>
                <video src={sourceUrl} controls className="w-full rounded-2xl border border-white/10" />
                <div className="flex gap-3">
                  <button onClick={handleAnalyze}
                    className="flex-1 py-5 bg-[#FDBC13] hover:bg-[#F3B20B] text-black font-black text-xl rounded-2xl flex items-center justify-center gap-3 transition shadow-lg shadow-[#FDBC13]/20">
                    <Sparkles className="w-6 h-6" /> Process with AI
                  </button>
                  <button onClick={() => { setRecordState('idle'); setSourceBlob(null); setSourceUrl(null); setSeconds(0); }}
                    className="px-6 py-5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl flex items-center gap-2 transition">
                    <RotateCcw className="w-5 h-5" /> Redo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 1B: Upload ─────────────────────────────────────────────── */}
        {stage === 'upload' && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <button onClick={() => setStage('choose')} className="p-2 hover:bg-white/10 rounded-xl transition">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-3xl font-black">📁 Upload a Video</h1>
            </div>

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={e => { e.preventDefault(); setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              className={`w-full rounded-3xl border-2 border-dashed flex flex-col items-center justify-center gap-4 cursor-pointer transition-all
                ${isDragOver ? 'border-violet-400 bg-violet-500/10 scale-[1.01]' : 'border-white/20 bg-white/5 hover:border-violet-400/60 hover:bg-violet-500/5'}
              `}
              style={{ minHeight: '320px' }}>
              <div className="text-6xl">{isDragOver ? '📂' : '📁'}</div>
              <div className="text-xl font-black text-white">Drag & drop your video here</div>
              <div className="text-white/50 font-medium">or click to browse files</div>
              <div className="flex gap-2 mt-2">
                {['MP4', 'MOV', 'WEBM', 'AVI', 'MKV'].map(f => (
                  <span key={f} className="px-3 py-1 bg-violet-500/20 rounded-full text-xs font-bold text-violet-300 border border-violet-500/30">{f}</span>
                ))}
              </div>
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
            </div>

            {/* Preview */}
            {sourceUrl && uploadFile && (
              <div className="space-y-4">
                <div className="p-4 bg-violet-500/10 border border-violet-500/40 rounded-2xl flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-violet-400" />
                  <span className="font-bold text-violet-300">{uploadFile.name} — {(uploadFile.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <video src={sourceUrl} controls className="w-full rounded-2xl border border-white/10" />
                <div className="flex gap-3">
                  <button onClick={handleAnalyze}
                    className="flex-1 py-5 bg-[#FDBC13] hover:bg-[#F3B20B] text-black font-black text-xl rounded-2xl flex items-center justify-center gap-3 transition shadow-lg shadow-[#FDBC13]/20">
                    <Sparkles className="w-6 h-6" /> Process with AI
                  </button>
                  <button onClick={() => { setUploadFile(null); setSourceBlob(null); setSourceUrl(null); }}
                    className="px-6 py-5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl flex items-center gap-2 transition">
                    <RotateCcw className="w-5 h-5" /> Change
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 2: Confirm / Analyzing ─────────────────────────────────── */}
        {stage === 'confirm' && (
          <div className="space-y-8 flex flex-col items-center text-center">
            <h1 className="text-3xl font-black">🧠 Analysing with AI</h1>
            <p className="text-white/60 font-medium max-w-md">
              Transcribing speech, detecting scenes, and understanding your video with Gemini…
            </p>

            {analyzeError ? (
              <div className="w-full max-w-lg p-6 bg-rose-500/10 border border-rose-500/40 rounded-2xl space-y-4">
                <div className="flex items-center gap-3 text-rose-300 font-bold">
                  <AlertTriangle className="w-6 h-6" /> {analyzeError}
                </div>
                <p className="text-white/50 text-sm">Make sure the Python backend is running: <code className="bg-white/10 px-2 py-0.5 rounded">npm run video:start</code></p>
                <button onClick={() => setStage(uploadFile ? 'upload' : 'record')}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition">
                  ← Go Back
                </button>
              </div>
            ) : (
              <div className="w-full max-w-lg space-y-6">
                {/* Progress bar */}
                <div className="space-y-3">
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#FDBC13] to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${analyzeProgress}%` }} />
                  </div>
                  <p className="text-sm font-semibold text-white/70 animate-pulse">{analyzeStep}</p>
                </div>

                {/* Steps visual */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { icon: '🎙', label: 'Transcription', done: analyzeProgress > 30 },
                    { icon: '🎬', label: 'Scene Detection', done: analyzeProgress > 60 },
                    { icon: '✨', label: 'AI Analysis', done: analyzeProgress > 85 },
                  ].map(s => (
                    <div key={s.label} className={`p-4 rounded-2xl border transition-all ${s.done ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
                      <div className="text-2xl mb-1">{s.done ? '✅' : s.icon}</div>
                      <div className={`text-xs font-bold ${s.done ? 'text-emerald-300' : 'text-white/50'}`}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 3: Choose output type ───────────────────────────────────── */}
        {stage === 'output-choose' && (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <button onClick={() => setStage(uploadFile ? 'upload' : 'record')}
                className="p-2 hover:bg-white/10 rounded-xl transition"><ArrowLeft className="w-5 h-5" /></button>
              <div>
                <h1 className="text-3xl font-black">🎨 Choose Video Style</h1>
                {subject && <p className="text-white/60 text-sm mt-1">Detected: <span className="text-[#FDBC13] font-semibold">{subject}</span></p>}
              </div>
            </div>

            {/* AI Suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-3">
                <label className="text-sm font-bold text-white/60 uppercase tracking-widest">AI Detected Topics</label>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => setFocusTopic(s)}
                      className={`px-4 py-2 rounded-full text-sm font-bold border transition ${
                        focusTopic === s
                          ? 'bg-[#FDBC13] text-black border-[#FDBC13]'
                          : 'bg-white/5 text-white/70 border-white/10 hover:border-[#FDBC13]/50'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom focus */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-white/60 uppercase tracking-widest">Custom Focus Topic (optional)</label>
              <input value={focusTopic} onChange={e => setFocusTopic(e.target.value)}
                placeholder="e.g. How to make biryani, Embroidery basics…"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 focus:border-[#FDBC13] rounded-2xl text-white font-semibold outline-none transition placeholder:text-white/30" />
            </div>

            {/* Mode cards */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-white/60 uppercase tracking-widest">Output Style</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {VIDEO_MODES.map(m => {
                  const Icon = m.icon;
                  return (
                    <button key={m.id} onClick={() => setSelectedMode(m.id)}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        selectedMode === m.id
                          ? 'border-[#FDBC13] bg-[#FDBC13]/10 scale-[1.03]'
                          : 'border-white/10 bg-white/5 hover:border-white/30'
                      }`}>
                      <Icon className={`w-7 h-7 mb-3 ${selectedMode === m.id ? 'text-[#FDBC13]' : 'text-white/50'}`} />
                      <div className="font-black text-sm text-white">{m.label}</div>
                      <div className="text-xs text-white/50 mt-1">{m.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button onClick={handleProcess}
              className="w-full py-6 bg-gradient-to-r from-[#FDBC13] to-orange-400 hover:opacity-90 text-black font-black text-2xl rounded-2xl flex items-center justify-center gap-3 transition shadow-2xl shadow-[#FDBC13]/20">
              <Scissors className="w-7 h-7" /> Generate Short Video
            </button>
          </div>
        )}

        {/* ── Stage 3b: Processing ─────────────────────────────────────────── */}
        {stage === 'processing' && (
          <div className="flex flex-col items-center text-center space-y-8">
            <h1 className="text-3xl font-black">⚙️ Generating Your Short</h1>
            <p className="text-white/60 font-medium max-w-md">
              FFmpeg is extracting and reframing your best moments into a vertical 9:16 short…
            </p>

            {jobError ? (
              <div className="w-full max-w-lg p-6 bg-rose-500/10 border border-rose-500/40 rounded-2xl space-y-4">
                <div className="flex items-center gap-3 text-rose-300 font-bold">
                  <AlertTriangle className="w-6 h-6" /> {jobError}
                </div>
                <button onClick={() => setStage('output-choose')}
                  className="w-full py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold transition">
                  ← Back to Options
                </button>
              </div>
            ) : (
              <div className="w-full max-w-lg space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm font-semibold text-white/60">
                    <span>{jobStep}</span>
                    <span>{jobProgress}%</span>
                  </div>
                  <div className="h-4 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-[#FDBC13] rounded-full transition-all duration-700"
                      style={{ width: `${jobProgress}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: 'Extracting clips', done: jobProgress > 36 },
                    { label: 'Vertical reframe', done: jobProgress > 62 },
                    { label: 'Adding subtitles', done: jobProgress > 85 },
                    { label: 'Finalising', done: jobProgress >= 95 },
                  ].map(s => (
                    <div key={s.label} className={`flex items-center gap-2 p-3 rounded-xl ${s.done ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-white/40'}`}>
                      {s.done ? <CheckCircle className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                      {s.label}
                    </div>
                  ))}
                </div>

                <p className="text-white/30 text-xs">This may take 2–5 minutes depending on video length.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 4: Preview ─────────────────────────────────────────────── */}
        {stage === 'preview' && clips.length > 0 && (
          <div className="space-y-6">
            <h1 className="text-3xl font-black text-center">🎉 Your Shorts Are Ready!</h1>

            {/* Clip selector */}
            {clips.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {clips.map((c, i) => (
                  <button key={i} onClick={() => setActiveClip(i)}
                    className={`flex-shrink-0 px-5 py-2 rounded-full font-bold text-sm border transition ${
                      activeClip === i ? 'bg-[#FDBC13] text-black border-[#FDBC13]' : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'
                    }`}>
                    Clip {i + 1} {c.title ? `— ${c.title.slice(0, 20)}` : ''}
                  </button>
                ))}
              </div>
            )}

            {/* Active clip */}
            {clips[activeClip]?.video_url && (
              <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl mx-auto"
                style={{ maxWidth: '360px', aspectRatio: '9/16', background: '#000' }}>
                <video src={clips[activeClip].video_url} controls autoPlay loop
                  className="w-full h-full object-contain" />
              </div>
            )}

            {/* Clip info */}
            {clips[activeClip] && (
              <div className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-2">
                {clips[activeClip].title && <h2 className="font-black text-lg text-white">{clips[activeClip].title}</h2>}
                {clips[activeClip].hook_text && <p className="text-white/60 text-sm">{clips[activeClip].hook_text}</p>}
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-2 gap-4">
              <a href={clips[activeClip]?.video_url || '#'} download={`silverhands_short_${activeClip + 1}.mp4`}
                className="py-5 bg-white/10 hover:bg-white/20 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-3 transition border border-white/10">
                <Download className="w-6 h-6" /> Download
              </a>
              <button onClick={handleSave} disabled={isSaving || saved}
                className="py-5 bg-[#031635] hover:bg-[#0d2b5e] disabled:opacity-60 text-[#FDBC13] font-black text-lg rounded-2xl flex items-center justify-center gap-3 transition border border-[#FDBC13]/30">
                {saved ? <><CheckCircle className="w-6 h-6" /> Saved!</> : isSaving ? <><Loader2 className="w-6 h-6 animate-spin" /> Saving…</> : <><Save className="w-6 h-6" /> Save to Profile</>}
              </button>
            </div>

            <div className="flex gap-4">
              <button onClick={() => { setStage('output-choose'); setSaved(false); setClips([]); }}
                className="flex-1 py-4 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 font-bold rounded-2xl flex items-center justify-center gap-2 transition border border-violet-500/30">
                <RotateCcw className="w-5 h-5" /> Try Another Style
              </button>
              <button onClick={() => router.push('/profile')}
                className="flex-1 py-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold rounded-2xl flex items-center justify-center gap-2 transition border border-emerald-500/30">
                <CheckCircle className="w-5 h-5" /> Go to Profile
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
