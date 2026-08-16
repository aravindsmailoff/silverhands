'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { voiceService } from '@/lib/voice';
import { getSavedProfile } from '@/lib/voice-agent';
import { Video, Mic, ArrowLeft, Sparkles, Hand, ThumbsUp, Square, RefreshCw, Save, RotateCcw } from 'lucide-react';

declare global {
  interface Window { Hands: any; }
}

export default function CreateVideoPage() {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────
  const [isRecording, setIsRecording]           = useState(false);
  const [recordedUrl, setRecordedUrl]           = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob]         = useState<Blob | null>(null);
  const [seconds, setSeconds]                   = useState(0);
  const [cameraReady, setCameraReady]           = useState(false);
  const [gestureReady, setGestureReady]         = useState(false);   // AI loaded & warmed up
  const [gestureFlash, setGestureFlash]         = useState<'NONE' | 'START' | 'STOP'>('NONE');
  const [topic, setTopic]                       = useState('');
  const [isListeningTopic, setIsListeningTopic] = useState(false);
  const [transcript, setTranscript]             = useState('');
  const [description, setDescription]           = useState('');
  const [isGenAI, setIsGenAI]                   = useState(false);
  const [isSaving, setIsSaving]                 = useState(false);
  const [cameraError, setCameraError]           = useState('');

  // ── Refs (no re-render needed) ─────────────────────────────────────
  const videoRef       = useRef<HTMLVideoElement>(null);
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const streamRef      = useRef<MediaStream | null>(null);
  const recorderRef    = useRef<MediaRecorder | null>(null);
  const chunksRef      = useRef<Blob[]>([]);
  const timerRef       = useRef<any>(null);
  const rafRef         = useRef<number | null>(null);
  const handsRef       = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const lastTriggerRef = useRef(0);
  const speechRef      = useRef<any>(null);
  const transcriptRef  = useRef('');     // live ref for transcript

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { transcriptRef.current  = transcript;   }, [transcript]);

  // ── Timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isRecording) {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  // ── One-time migration: strip old base64 video blobs from localStorage ──
  // Keeps all metadata (title, description, date) — only removes large video data
  useEffect(() => {
    try {
      const raw = localStorage.getItem('silverhands_recorded_videos');
      if (raw) {
        const entries = JSON.parse(raw);
        const cleaned = entries.map((v: any) => {
          const { videoUrl, videoData, ...meta } = v;
          return meta;  // keep id, topic, description, recordedAt, creatorName
        });
        localStorage.setItem('silverhands_recorded_videos', JSON.stringify(cleaned));
      }
    } catch {
      // If still too large, just clear the key
      localStorage.removeItem('silverhands_recorded_videos');
    }
  }, []);

  // ── Boot: camera + MediaPipe (auto-start, no toggle) ──────────────
  useEffect(() => {
    let alive = true;

    const boot = async () => {
      // 1. Get camera stream
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
          locateFile: (f: string) =>
            f.startsWith('http') ? f : `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.6 });
        hands.onResults(onHandResults);
        await hands.initialize();
        handsRef.current = hands;

        // 3-second warm-up before gestures go live
        lastTriggerRef.current = Date.now() + 3000;
        setTimeout(() => { if (alive) setGestureReady(true); }, 3200);

        // 3. Start RAF frame-feed loop (never uses window.Camera, stream is safe)
        startRAFLoop();
      } catch (e) {
        console.warn('MediaPipe load warning:', e);
        // Camera still works; gestures just won't be available
      }
    };

    boot();

    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── RAF loop: feed frames to MediaPipe from hidden canvas ──────────
  const startRAFLoop = useCallback(() => {
    if (!canvasRef.current) {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 240;
      canvasRef.current = c;
    }
    const canvas = canvasRef.current;
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

  // ── MediaPipe result handler ───────────────────────────────────────
  const onHandResults = useCallback((results: any) => {
    const now = Date.now();
    if (now < lastTriggerRef.current) return;           // warm-up or cooldown
    if (!results.multiHandLandmarks?.length) return;

    const lm = results.multiHandLandmarks[0];

    const thumbTip = lm[4], thumbIp = lm[3];
    const idxTip   = lm[8],  idxPip = lm[6];
    const midTip   = lm[12], midPip = lm[10];
    const rngTip   = lm[16], rngPip = lm[14];
    const pkyTip   = lm[20], pkyPip = lm[18];
    const wrist    = lm[0];

    // Extended = tip clearly above PIP
    const idxExt = idxTip.y < idxPip.y - 0.04;
    const midExt = midTip.y < midPip.y - 0.04;
    const rngExt = rngTip.y < rngPip.y - 0.04;
    const pkyExt = pkyTip.y < pkyPip.y - 0.04;

    // Curled = tip clearly below PIP
    const idxCurl = idxTip.y > idxPip.y + 0.03;
    const midCurl = midTip.y > midPip.y + 0.03;
    const rngCurl = rngTip.y > rngPip.y + 0.03;
    const pkyCurl = pkyTip.y > pkyPip.y + 0.03;

    // Thumb pointing up
    const thumbUp = thumbTip.y < thumbIp.y - 0.04 && thumbTip.y < wrist.y - 0.08;

    const isThumbsUp  = thumbUp && idxCurl && midCurl && rngCurl && pkyCurl;
    const isOpenPalm  = idxExt  && midExt  && rngExt  && pkyExt;

    if (isThumbsUp && !isRecordingRef.current) {
      lastTriggerRef.current = now + 3000;   // 3-second cooldown
      startRecording();
    } else if (isOpenPalm && isRecordingRef.current) {
      lastTriggerRef.current = now + 3000;
      stopRecording();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(() => {
    if (!streamRef.current || isRecordingRef.current) return;

    setRecordedUrl(null);
    setRecordedBlob(null);
    setTranscript('');
    setDescription('');
    chunksRef.current = [];

    try {
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9'
                 : MediaRecorder.isTypeSupported('video/webm')            ? 'video/webm'
                 : '';
      const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);

      rec.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setRecordedBlob(blob);
        setRecordedUrl(URL.createObjectURL(blob));
        stopSpeechAndGenerate();
      };

      rec.start(200);
      recorderRef.current = rec;
      setIsRecording(true);
      startSpeech();
      setGestureFlash('START');
      setTimeout(() => setGestureFlash('NONE'), 2000);
      voiceService.speak('Recording started!', 'en-IN');
    } catch (err) {
      console.error('MediaRecorder error:', err);
      alert('Recording failed. Please reload the page and try again.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setIsRecording(false);
    setGestureFlash('STOP');
    setTimeout(() => setGestureFlash('NONE'), 2000);
    voiceService.speak('Video saved!', 'en-IN');
  }, []);

  // ── Speech recognition ─────────────────────────────────────────────
  const startSpeech = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    try {
      if (speechRef.current) { try { speechRef.current.stop(); } catch (_) {} }
      const r = new SR();
      r.continuous = true; r.interimResults = false; r.lang = 'en-IN';
      r.onresult = (e: any) => {
        let t = '';
        for (let i = e.resultIndex; i < e.results.length; i++)
          if (e.results[i].isFinal) t += e.results[i][0].transcript + ' ';
        if (t.trim()) setTranscript(prev => (prev + ' ' + t).trim());
      };
      r.onerror = () => {};
      r.start();
      speechRef.current = r;
    } catch (_) {}
  };

  const stopSpeechAndGenerate = () => {
    if (speechRef.current) { try { speechRef.current.stop(); } catch (_) {} }
    // Wait 1.5s for the speech recognition engine to flush its final results
    setTimeout(() => generateAI(), 1500);
  };

  const generateAI = async (txt?: string) => {
    // Use passed text → live transcript → topic → generic fallback
    const src = (txt || transcriptRef.current || topic || '').trim();
    const fallback = src || 'Senior creator video lesson';

    // Immediately show a default so the field is never blank
    const creatorName = getSavedProfile()?.name || 'Creator';
    setDescription(`In this video, ${creatorName} shares their expertise: "${fallback}".`);

    if (!src) return;   // nothing to send to AI; default is already set

    setIsGenAI(true);
    try {
      const res  = await fetch('/api/ai/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'video_description', transcript: src, creatorName }),
      });
      const data = await res.json();
      if (data.success && data.description) {
        setDescription(data.description);
        if (data.title) setTopic(data.title);
      }
      // If AI fails, the default set above remains
    } catch { /* keep the default already set */ }
    finally { setIsGenAI(false); }
  };

  const toggleTopic = () => {
    if (isListeningTopic) {
      voiceService.stopListening();
      setIsListeningTopic(false);
    } else {
      setIsListeningTopic(true);
      voiceService.startListening({
        onResult: r => { if (r.transcript) setTopic(r.transcript); },
        onError:  () => setIsListeningTopic(false),
        onEnd:    () => setIsListeningTopic(false),
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const profile = getSavedProfile();
    const finalT  = topic.trim() || 'Senior Lesson Video';
    const finalD  = description || transcript || finalT;
    const videoId = 'vid_' + Date.now();

    // ── 1. LocalStorage: metadata ONLY (no video blob — videos are too large) ──
    try {
      const existing = JSON.parse(localStorage.getItem('silverhands_recorded_videos') || '[]');
      // Keep only last 10 entries and strip any old videoUrl blobs to prevent buildup
      const trimmed = existing.slice(0, 9).map((v: any) => ({ ...v, videoUrl: undefined }));
      trimmed.unshift({
        id: videoId,
        topic: finalT,
        description: finalD,
        recordedAt: new Date().toLocaleDateString(),
        creatorName: profile?.name,
        // No videoUrl stored in localStorage — video lives in PostgreSQL
      });
      localStorage.setItem('silverhands_recorded_videos', JSON.stringify(trimmed));
    } catch (lsErr) {
      // If localStorage is still full, clear old videos and try once more
      try {
        localStorage.removeItem('silverhands_recorded_videos');
        localStorage.setItem('silverhands_recorded_videos', JSON.stringify([{
          id: videoId, topic: finalT, description: finalD,
          recordedAt: new Date().toLocaleDateString(), creatorName: profile?.name,
        }]));
      } catch {}
    }

    // ── 2. PostgreSQL: save full video as base64 ──
    try {
      const b64 = recordedBlob
        ? await new Promise<string>(res => {
            const fr = new FileReader();
            fr.onloadend = () => res(fr.result as string);
            fr.onerror   = () => res('');
            fr.readAsDataURL(recordedBlob);
          })
        : null;

      await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: finalT,
          description: finalD,
          videoUrl: recordedUrl || '',
          videoData: b64,
          creatorName: profile?.name,
        }),
      });
    } catch (dbErr) {
      console.warn('Video DB save notice:', dbErr);
    }

    voiceService.speak('Your video has been saved!', 'en-IN');
    setIsSaving(false);
    setTimeout(() => router.push('/profile'), 800);
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── UI ─────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#FFFDF7] min-h-screen flex flex-col" style={{ fontFamily: "'Lexend', sans-serif" }}>

      {/* Header */}
      <header className="bg-white border-b-4 border-[#FDBC13] shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-14 h-14 bg-[#031635] rounded-2xl flex items-center justify-center text-2xl shadow-md">🤝</div>
            <div>
              <span className="font-black text-2xl text-[#031635] block">SilverHands</span>
              <span className="text-sm font-semibold text-[#44474E] block">Video Studio</span>
            </div>
          </Link>
          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-5 py-3 bg-[#EFEEEB] hover:bg-[#E3E2E0] rounded-2xl text-base font-bold text-[#031635] transition">
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 space-y-8">

        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl md:text-5xl font-black text-[#031635]">🎬 Record Your Lesson</h1>
          <p className="text-xl text-[#44474E] font-semibold">
            👍 <strong>Thumbs Up</strong> to start &nbsp;·&nbsp; ✋ <strong>Open Palm</strong> to stop
          </p>
        </div>

        {cameraError && (
          <div className="p-6 bg-rose-50 border-2 border-rose-400 rounded-2xl text-rose-800 font-bold text-center text-lg">
            ⚠️ {cameraError}
          </div>
        )}

        {!recordedUrl ? (
          /* ── LIVE CAMERA VIEW ── */
          <div className="space-y-6">

            {/* Camera box */}
            <div className="relative w-full rounded-3xl overflow-hidden border-4 shadow-2xl"
              style={{ aspectRatio: '16/9', background: '#0f172a',
                borderColor: isRecording ? '#dc2626' : '#031635' }}>

              <video ref={videoRef} autoPlay playsInline muted
                className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />

              {/* Gesture-ready indicator (top-left) */}
              <div className="absolute top-4 left-4 z-20">
                {!gestureReady ? (
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-base font-bold animate-pulse">
                    ⏳ Getting ready…
                  </div>
                ) : !isRecording ? (
                  <div className="bg-black/70 text-white px-4 py-2 rounded-full text-base font-bold">
                    👍 Show Thumbs Up to Record
                  </div>
                ) : null}
              </div>

              {/* Recording timer (top-right) */}
              {isRecording && (
                <div className="absolute top-4 right-4 z-20 bg-rose-600 text-white px-5 py-2 rounded-full text-xl font-black animate-pulse shadow-lg">
                  🔴 {fmt(seconds)}
                </div>
              )}

              {/* Gesture flash overlay */}
              {gestureFlash === 'START' && (
                <div className="absolute inset-0 bg-emerald-900/80 flex flex-col items-center justify-center z-30">
                  <ThumbsUp className="w-28 h-28 text-[#FDBC13] animate-bounce" />
                  <span className="text-4xl font-black text-[#FDBC13] mt-4">Recording!</span>
                </div>
              )}
              {gestureFlash === 'STOP' && (
                <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center z-30">
                  <Hand className="w-28 h-28 text-white animate-pulse" />
                  <span className="text-4xl font-black text-white mt-4">Saved!</span>
                </div>
              )}

              {/* Stop hint while recording */}
              {isRecording && gestureFlash === 'NONE' && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center z-20">
                  <div className="bg-black/70 text-white px-5 py-2 rounded-full text-base font-bold">
                    ✋ Show Open Palm to Stop
                  </div>
                </div>
              )}
            </div>

            {/* Manual buttons (backup) */}
            <div className="grid grid-cols-2 gap-4">
              {!isRecording ? (
                <button onClick={startRecording} disabled={!cameraReady}
                  className="col-span-2 py-6 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-2xl font-black rounded-2xl shadow-lg flex items-center justify-center gap-3 active:scale-95 transition">
                  <Video className="w-8 h-8" /> Start Recording
                </button>
              ) : (
                <button onClick={stopRecording}
                  className="col-span-2 py-6 bg-rose-600 hover:bg-rose-700 text-white text-2xl font-black rounded-2xl shadow-lg flex items-center justify-center gap-3 active:scale-95 animate-pulse transition">
                  <Square className="w-8 h-8 fill-white" /> Stop &amp; Save
                </button>
              )}
            </div>

            {/* Topic voice input */}
            <div className="bg-white border-2 border-[#E3E2E0] rounded-2xl p-6 space-y-3">
              <label className="text-lg font-extrabold text-[#031635] block">What is this video about?</label>
              <div className="flex gap-3">
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  placeholder="e.g. Making dal tadka"
                  className="flex-1 px-4 py-3 border-2 border-[#E3E2E0] rounded-xl text-lg font-semibold focus:border-[#031635] outline-none"
                />
                <button onClick={toggleTopic}
                  className={`px-5 py-3 rounded-xl text-base font-bold transition ${isListeningTopic ? 'bg-rose-600 text-white animate-pulse' : 'bg-[#FDBC13] text-[#261900] hover:bg-[#F3B20B]'}`}>
                  <Mic className="w-6 h-6" />
                </button>
              </div>
            </div>
          </div>

        ) : (
          /* ── PLAYBACK & SAVE VIEW ── */
          <div className="space-y-6">

            {/* Video player */}
            <div className="relative w-full rounded-3xl overflow-hidden border-4 border-[#031635] shadow-2xl" style={{ aspectRatio: '16/9' }}>
              <video src={recordedUrl} controls autoPlay className="w-full h-full object-contain bg-black" />
              <div className="absolute top-4 left-4 bg-emerald-600 text-white px-4 py-2 rounded-full text-base font-extrabold shadow-md">
                ✓ Video Recorded
              </div>
            </div>

            {/* AI description */}
            <div className="bg-white border-2 border-[#031635] rounded-2xl p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-[#FDBC13]" />
                <span className="text-lg font-extrabold text-[#031635]">Video Description</span>
              </div>
              {isGenAI ? (
                <div className="flex items-center gap-3 text-[#44474E] font-semibold text-base animate-pulse">
                  <RefreshCw className="w-5 h-5 animate-spin" /> Writing description from your speech…
                </div>
              ) : (
                <>
                  <textarea
                    value={description || transcript || `In this video, ${getSavedProfile()?.name || 'Creator'} shares their expertise.`}
                    onChange={e => setDescription(e.target.value)}
                    rows={4}
                    className="w-full p-4 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-xl text-base font-semibold outline-none focus:border-[#031635] resize-none"
                  />
                  <button
                    onClick={() => generateAI()}
                    className="w-full py-3 bg-[#031635] hover:bg-[#1a2b4b] text-[#FDBC13] text-base font-bold rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <Sparkles className="w-5 h-5" /> Rewrite with AI
                  </button>
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button onClick={handleSave} disabled={isSaving}
                className="py-6 bg-[#031635] hover:bg-[#1a2b4b] disabled:opacity-60 text-[#FDBC13] text-xl font-black rounded-2xl shadow-lg flex items-center justify-center gap-3 active:scale-95 transition">
                <Save className="w-7 h-7" /> {isSaving ? 'Saving…' : 'Save Video'}
              </button>
              <button onClick={() => { setRecordedUrl(null); setRecordedBlob(null); }}
                className="py-6 bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] text-xl font-black rounded-2xl shadow-md flex items-center justify-center gap-3 active:scale-95 transition border-2 border-[#E3E2E0]">
                <RotateCcw className="w-7 h-7" /> Record Again
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
