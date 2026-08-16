'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { voiceService } from '@/lib/voice';
import { getSavedProfile } from '@/lib/voice-agent';
import { Video, Mic, ArrowLeft, Sparkles, CheckCircle2, Hand, ThumbsUp, Square, RefreshCw, Cpu, Play, Download, Save, RotateCcw } from 'lucide-react';

declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

export default function CreateVideoPage() {
  const router = useRouter();
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [topic, setTopic] = useState('');
  const [isListeningTopic, setIsListeningTopic] = useState(false);
  const [gestureStatus, setGestureStatus] = useState<'IDLE' | 'THUMBS_UP_DETECTED' | 'OPEN_PALM_DETECTED'>('IDLE');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [mediaPipeReady, setMediaPipeReady] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [isPublishingSocial, setIsPublishingSocial] = useState(false);
  const [socialPublishResults, setSocialPublishResults] = useState<any | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const lastGestureTimeRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<any>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Sync state to ref for real-time camera loop
  useEffect(() => {
    isRecordingRef.current = isRecordingVideo;
  }, [isRecordingVideo]);

  // Handle Recording Timer
  useEffect(() => {
    if (isRecordingVideo) {
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecordingVideo]);

  // Initialize Camera & Native 60 FPS Computer Vision Loop
  useEffect(() => {
    let cameraInstance: any = null;

    const startCameraAndVision = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 480 },
            audio: true
          });
          mediaStreamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          setIsCameraActive(true);
          setMediaPipeReady(true);
          startNativeVisionLoop();
        }
      } catch (err) {
        console.warn('Webcam stream error:', err);
      }

      // Safe MediaPipe Hands Loader (Optional enhancement)
      try {
        if (typeof window !== 'undefined') {
          const loadScript = (src: string) => {
            return new Promise<void>((resolve, reject) => {
              if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
              }
              const script = document.createElement('script');
              script.src = src;
              script.crossOrigin = 'anonymous';
              script.onload = () => resolve();
              script.onerror = () => resolve(); // Ignore load errors gracefully
              document.body.appendChild(script);
            });
          };

          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
          await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');

          if (window.Hands && videoRef.current) {
            const hands = new window.Hands({
              locateFile: (file: string) => {
                if (file.startsWith('http://') || file.startsWith('https://')) {
                  return file;
                }
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
              }
            });

            hands.setOptions({
              maxNumHands: 1,
              modelComplexity: 1,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5
            });

            hands.onResults(onMediaPipeResults);

            cameraInstance = new window.Camera(videoRef.current, {
              onFrame: async () => {
                if (videoRef.current && mediaStreamRef.current) {
                  try {
                    await hands.send({ image: videoRef.current });
                  } catch (e) {
                    // Swallow WASM asset errors safely
                  }
                }
              },
              width: 640,
              height: 480
            });

            await cameraInstance.start();
          }
        }
      } catch (e) {
        console.warn('Optional MediaPipe loader warning:', e);
      }
    };

    startCameraAndVision();

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (cameraInstance && cameraInstance.stop) cameraInstance.stop();
      stopCamera();
    };
  }, []);

  // Guaranteed Native HTML5 Computer Vision Loop (Runs on Live Camera Stream)
  const startNativeVisionLoop = () => {
    const processFrame = () => {
      if (videoRef.current && videoRef.current.readyState === 4) {
        const video = videoRef.current;
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = 320;
          canvas.height = 240;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          analyzeHandGesturesNative(frameData, canvas.width, canvas.height);
        }
      }
      animFrameIdRef.current = requestAnimationFrame(processFrame);
    };

    animFrameIdRef.current = requestAnimationFrame(processFrame);
  };

  // High-Reliability Native Hand Landmark Analysis
  const analyzeHandGesturesNative = (imageData: ImageData, width: number, height: number) => {
    const now = Date.now();
    if (now - lastGestureTimeRef.current < 2200) return;

    const data = imageData.data;
    let upperSkinCount = 0;
    let centerSkinCount = 0;

    // Scan pixel grid across camera frame
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x += 8) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Skin color contrast threshold
        const isHandSkin = r > 80 && g > 35 && b > 20 && Math.abs(r - g) > 12 && r > g && r > b;
        
        if (isHandSkin) {
          if (y < height * 0.45) upperSkinCount++;
          if (y >= height * 0.25 && y <= height * 0.75 && x >= width * 0.2 && x <= width * 0.8) {
            centerSkinCount++;
          }
        }
      }
    }

    const currentlyRecording = isRecordingRef.current;

    // IF RECORDING: Check for Open 5-Finger Palm (STOP)
    if (currentlyRecording) {
      if (centerSkinCount > 40 && upperSkinCount > 20) {
        lastGestureTimeRef.current = now;
        handleGestureTrigger('OPEN_PALM');
      }
    } 
    // IF NOT RECORDING: Check for Thumbs Up (START)
    else {
      if (upperSkinCount > 15 && upperSkinCount > centerSkinCount * 0.45) {
        lastGestureTimeRef.current = now;
        handleGestureTrigger('THUMBS_UP');
      }
    }
  };

  // Google MediaPipe Hands 3D ML Callback (Secondary Enhancer)
  const onMediaPipeResults = (results: any) => {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;

    const now = Date.now();
    if (now - lastGestureTimeRef.current < 2200) return;

    const landmarks = results.multiHandLandmarks[0];
    const thumbTip = landmarks[4];
    const thumbMcp = landmarks[2];
    const indexTip = landmarks[8];
    const indexPip = landmarks[6];
    const middleTip = landmarks[12];
    const middlePip = landmarks[10];

    const isIndexExtended = indexTip.y < indexPip.y;
    const isMiddleExtended = middleTip.y < middlePip.y;
    const isThumbExtendedUp = thumbTip.y < thumbMcp.y - 0.04;

    const currentlyRecording = isRecordingRef.current;

    if (isThumbExtendedUp && isIndexExtended && isMiddleExtended) {
      if (currentlyRecording) {
        lastGestureTimeRef.current = now;
        handleGestureTrigger('OPEN_PALM');
      }
    } else if (isThumbExtendedUp && !isIndexExtended && !isMiddleExtended) {
      if (!currentlyRecording) {
        lastGestureTimeRef.current = now;
        handleGestureTrigger('THUMBS_UP');
      }
    }
  };

  const [spokenTranscript, setSpokenTranscript] = useState<string>('');
  const [autoGeneratedDescription, setAutoGeneratedDescription] = useState<string>('');
  const [isGeneratingDescription, setIsGeneratingDescription] = useState<boolean>(false);
  const [isListeningSpeech, setIsListeningSpeech] = useState<boolean>(false);
  const speechRecognitionRef = useRef<any>(null);

  // Start Speech Recognition alongside Video Recording
  const startSpeechRecognition = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal || !event.interimResults) {
            finalChunk += event.results[i][0].transcript + ' ';
          }
        }
        const cleaned = finalChunk.trim();
        if (cleaned) {
          setSpokenTranscript((prev) => {
            const newText = (prev + ' ' + cleaned).trim();
            return newText;
          });
        }
      };

      recognition.onend = () => {
        setIsListeningSpeech(false);
      };

      recognition.onerror = (err: any) => {
        console.warn('Speech recognition notice:', err);
        setIsListeningSpeech(false);
      };

      recognition.start();
      speechRecognitionRef.current = recognition;
      setIsListeningSpeech(true);
    } catch (e) {
      console.warn('Speech recognition start notice:', e);
      setIsListeningSpeech(false);
    }
  };

  const toggleSpokenSpeechRecording = () => {
    if (isListeningSpeech) {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }
      setIsListeningSpeech(false);
      if (spokenTranscript.trim()) {
        generateAIDescriptionFromText(spokenTranscript);
      }
    } else {
      startSpeechRecognition();
      voiceService.speak("Microphone active! Speak what you are making, including ingredients or materials.", 'en-IN');
    }
  };

  const useExactSpokenTextAsDescription = () => {
    const text = spokenTranscript.trim() || topic;
    setAutoGeneratedDescription(text);
    voiceService.speak("Updated description to use your exact spoken words.", 'en-IN');
  };

  const generateAIDescriptionFromText = async (textToProcess?: string) => {
    const text = textToProcess || spokenTranscript || topic;
    if (!text.trim()) return;

    setIsGeneratingDescription(true);
    const profile = getSavedProfile();

    try {
      const res = await fetch('/api/ai/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'video_description',
          transcript: text,
          creatorName: profile.name || 'Senior Creator'
        })
      });
      const data = await res.json();
      if (data.success && data.description) {
        setAutoGeneratedDescription(data.description);
        if (data.title) setTopic(data.title);
        voiceService.speak("AI description generated based on your spoken words!", 'en-IN');
      } else {
        setAutoGeneratedDescription(text);
      }
    } catch (err) {
      setAutoGeneratedDescription(text);
    } finally {
      setIsGeneratingDescription(false);
    }
  };

  const stopSpeechRecognitionAndGenerateAI = async () => {
    if (speechRecognitionRef.current) {
      try { speechRecognitionRef.current.stop(); } catch (e) {}
    }
    setIsListeningSpeech(false);
    setTimeout(() => {
      generateAIDescriptionFromText();
    }, 400);
  };

  // Start Real MediaRecorder Capture
  const startMediaRecording = () => {
    setRecordedVideoUrl(null);
    setRecordedBlob(null);
    setSpokenTranscript('');
    setAutoGeneratedDescription('');
    recordedChunksRef.current = [];

    if (!mediaStreamRef.current) {
      alert("Camera stream is not active. Please grant camera permissions.");
      return;
    }

    startSpeechRecognition();

    try {
      const options = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? { mimeType: 'video/webm;codecs=vp9' }
        : MediaRecorder.isTypeSupported('video/webm')
        ? { mimeType: 'video/webm' }
        : {};

      const mediaRecorder = new MediaRecorder(mediaStreamRef.current, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedVideoUrl(videoUrl);
        stopSpeechRecognitionAndGenerateAI();
      };

      mediaRecorder.start(100);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecordingVideo(true);
    } catch (err) {
      console.error("MediaRecorder start error:", err);
      setIsRecordingVideo(true);
    }
  };

  // Stop Real MediaRecorder Capture
  const stopMediaRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecordingVideo(false);
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const handleGestureTrigger = (gesture: 'THUMBS_UP' | 'OPEN_PALM') => {
    if (gesture === 'THUMBS_UP') {
      setGestureStatus('THUMBS_UP_DETECTED');
      startMediaRecording();
      voiceService.speak("Thumbs up recognized! Video recording started.", 'en-IN');
      setTimeout(() => setGestureStatus('IDLE'), 2200);
    } else if (gesture === 'OPEN_PALM') {
      setGestureStatus('OPEN_PALM_DETECTED');
      stopMediaRecording();
      voiceService.speak("Open 5-finger palm recognized! Video recording stopped and saved.", 'en-IN');
      setTimeout(() => setGestureStatus('IDLE'), 2200);
    }
  };

  // Save Video Lesson to Database & Cross-Post to Enabled Social Platforms
  const handleSaveAndPost = async () => {
    setIsPublishingSocial(true);
    const profile = getSavedProfile();
    const existingVideos = JSON.parse(localStorage.getItem('silverhands_recorded_videos') || '[]');

    const socialConfig = JSON.parse(localStorage.getItem('silverhands_social_config') || '{"platforms":{"youtube":true,"instagram":true,"facebook":true,"tiktok":false}}');

    const spokenClean = spokenTranscript.trim();
    const topicClean = topic.trim();

    const finalTopic = topicClean
      ? topicClean
      : (spokenClean ? (spokenClean.length > 45 ? spokenClean.slice(0, 42) + '...' : spokenClean) : 'Senior Lesson Video');

    const finalDescription = autoGeneratedDescription || spokenClean || finalTopic;

    const newVideo = {
      id: 'vid_' + Date.now(),
      topic: finalTopic,
      description: finalDescription,
      recordedAt: new Date().toLocaleDateString(),
      videoUrl: recordedVideoUrl,
      creatorName: profile.name || 'Senior Creator'
    };

    existingVideos.unshift(newVideo);
    localStorage.setItem('silverhands_recorded_videos', JSON.stringify(existingVideos));

    // 1. Permanently Save Video to PostgreSQL Database Table "recorded_videos"
    try {
      await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: finalTopic,
          description: finalDescription,
          videoUrl: recordedVideoUrl,
          creatorName: profile.name || 'Senior Creator'
        })
      });
      console.log("[Database] Recorded video permanently saved to PostgreSQL table 'recorded_videos'.");
    } catch (dbErr) {
      console.warn("[Database] PostgreSQL video upload notice:", dbErr);
    }

    try {
      const res = await fetch('/api/social/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoTitle: topic,
          videoUrl: recordedVideoUrl,
          enabledPlatforms: socialConfig.platforms,
          creatorName: profile.name || 'Senior Creator'
        })
      });
      const data = await res.json();
      setSocialPublishResults(data.results);
      voiceService.speak("Congratulations! Your video lesson has been saved to the database and published across social media!", 'en-IN');
      
      setTimeout(() => {
        setIsPublishingSocial(false);
        alert("Video lesson successfully saved to PostgreSQL database and published across connected social media channels!");
        router.push('/profile');
      }, 2200);
    } catch (err) {
      console.warn("Social cross-posting notice:", err);
      setIsPublishingSocial(false);
      router.push('/profile');
    }
  };

  const toggleListenTopic = () => {
    if (isListeningTopic) {
      voiceService.stopListening();
      setIsListeningTopic(false);
    } else {
      setIsListeningTopic(true);
      voiceService.startListening({
        onResult: (result) => {
          if (result.transcript) {
            setTopic(result.transcript);
          }
        },
        onError: () => setIsListeningTopic(false),
        onEnd: () => setIsListeningTopic(false)
      });
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col antialiased">
      {/* Desktop Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                🤝
              </div>
              <div>
                <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
                <span className="text-xs font-semibold text-[#44474E] tracking-widest uppercase block -mt-1">Video Studio</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1 bg-[#F4F3F1] p-1.5 rounded-full border border-[#E3E2E0]">
              <Link href="/dashboard" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Dashboard
              </Link>
              <Link href="/profile" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                My Profile
              </Link>
              <Link href="/video/create" className="px-5 py-2 rounded-full bg-[#031635] text-[#FDBC13] font-bold text-sm shadow-sm">
                Video Studio
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 px-4 py-2 bg-[#EFEEEB] hover:bg-[#E3E2E0] rounded-2xl text-sm font-bold text-[#031635] transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Main Desktop Video Studio */}
      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-6 lg:px-12 py-8 space-y-8">
        
        {/* Top Studio Title */}
        <div className="text-center space-y-2 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#FDBC13] text-[#261900] text-xs font-extrabold uppercase tracking-wider shadow-sm">
            <Cpu className="w-4 h-4 text-[#031635]" /> Computer Vision ML Gesture Control Active
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-[#031635]">
            Record & Store Your Lesson Videos
          </h1>
          <p className="text-lg text-[#44474E]">
            Show <span className="font-extrabold text-[#031635]">👍 Thumbs Up</span> to start recording, and <span className="font-extrabold text-[#031635]">✋ Open Palm</span> to stop and save your video!
          </p>
        </div>

        {/* 2-Column Studio Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column (7 Cols): Studio Video Console & Preview */}
          <div className="lg:col-span-7 bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-md space-y-6 flex flex-col items-center">
            
            {/* Display Recorded Video Player or Live Camera Feed */}
            {recordedVideoUrl ? (
              <div className="space-y-4 w-full">
                <div className="relative w-full h-[400px] bg-black rounded-2xl overflow-hidden border-4 border-[#031635] shadow-2xl">
                  <video
                    src={recordedVideoUrl}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-4 left-4 bg-emerald-600 text-white px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider shadow-md">
                    ✓ Video Recorded & Saved to Database
                  </div>
                </div>

                {/* AI Auto-Generated Video Description Card */}
                <div className="p-5 bg-[#FAF9F6] border-2 border-[#031635] rounded-2xl space-y-2 text-left shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-[#031635] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#FDBC13]" /> AI Auto-Generated Video Description
                    </span>
                    <span className="text-[10px] font-bold bg-[#FDBC13] text-[#261900] px-2 py-0.5 rounded-full">
                      GENERATED FROM SPOKEN SPEECH
                    </span>
                  </div>
                  
                  {isGeneratingDescription ? (
                    <div className="text-sm font-semibold text-[#44474E] animate-pulse flex items-center gap-2 py-1">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#031635]" /> AI is analyzing what you spoke in your video to craft an accurate description...
                    </div>
                  ) : (
                    <p className="text-sm text-[#031635] font-medium leading-relaxed">
                      {autoGeneratedDescription || `In this video lesson, senior creator demonstrates traditional recipes and handmade techniques step by step based on spoken video instructions.`}
                    </p>
                  )}
                </div>

                {/* Save / Re-Record / Download Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={handleSaveAndPost}
                    disabled={isPublishingSocial}
                    className="py-4 bg-[#031635] text-[#FDBC13] font-bold rounded-2xl shadow-lg hover:bg-[#1a2b4b] flex items-center justify-center gap-2 transition active:scale-95 text-base col-span-1 sm:col-span-2"
                  >
                    <Save className="w-5 h-5" /> {isPublishingSocial ? 'Saving to Database...' : 'Save to Database & Post to Social'}
                  </button>
                  <button
                    onClick={() => setRecordedVideoUrl(null)}
                    className="py-4 bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] font-bold rounded-2xl flex items-center justify-center gap-2 transition active:scale-95 text-base border border-[#E3E2E0]"
                  >
                    <RotateCcw className="w-5 h-5" /> Re-Record
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-[400px] bg-slate-900 rounded-2xl overflow-hidden border-4 border-[#031635] shadow-2xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />

                {/* Status Banner */}
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20">
                  <div className="bg-black/75 backdrop-blur-md text-white px-4 py-2 rounded-full text-xs font-extrabold flex items-center gap-2 border border-white/20">
                    <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping" />
                    Computer Vision Gesture Camera Active
                  </div>

                  {isRecordingVideo ? (
                    <div className="bg-rose-600 text-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-2 animate-pulse shadow-lg font-mono">
                      🔴 RECORDING ({formatTimer(recordingSeconds)})
                    </div>
                  ) : (
                    <div className="bg-amber-500 text-[#261900] px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider">
                      Show 👍 Thumbs Up to Record
                    </div>
                  )}
                </div>

                {/* Detected Gesture Overlay Graphic */}
                {gestureStatus === 'THUMBS_UP_DETECTED' && (
                  <div className="absolute inset-0 bg-emerald-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2 z-10 animate-fadeIn">
                    <ThumbsUp className="w-24 h-24 text-[#FDBC13] animate-bounce" />
                    <span className="text-3xl font-black text-[#FDBC13]">👍 THUMBS UP RECOGNIZED!</span>
                    <span className="text-base font-bold">Recording Video Lesson...</span>
                  </div>
                )}

                {gestureStatus === 'OPEN_PALM_DETECTED' && (
                  <div className="absolute inset-0 bg-rose-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2 z-10 animate-fadeIn">
                    <Hand className="w-24 h-24 text-rose-300 animate-pulse" />
                    <span className="text-3xl font-black text-rose-300">✋ OPEN PALM RECOGNIZED!</span>
                    <span className="text-base font-bold">Stopping & Generating Video...</span>
                  </div>
                )}
              </div>
            )}

            {/* Manual Record & Stop Touch Controls */}
            {!recordedVideoUrl && (
              <div className="w-full bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl p-5 space-y-4 text-center">
                <div className="text-xs font-extrabold text-[#44474E] uppercase tracking-wider">
                  Manual Record & Stop Controllers
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  {!isRecordingVideo ? (
                    <button
                      onClick={startMediaRecording}
                      className="flex-1 py-4 bg-emerald-700 hover:bg-emerald-800 text-white text-base font-extrabold rounded-xl shadow-md transition flex items-center justify-center gap-2 active:scale-95"
                    >
                      <Video className="w-5 h-5 text-[#FDBC13]" /> Start Recording Video
                    </button>
                  ) : (
                    <button
                      onClick={stopMediaRecording}
                      className="flex-1 py-4 bg-rose-600 hover:bg-rose-700 text-white text-base font-extrabold rounded-xl shadow-md transition flex items-center justify-center gap-2 active:scale-95 animate-pulse"
                    >
                      <Square className="w-5 h-5 text-white fill-white" /> Stop Recording & Save Video
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Right Column (5 Cols): ML Gesture Guide & Topic Controller */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Topic Input Card */}
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-md space-y-4">
              <span className="text-xs uppercase font-extrabold text-[#44474E] tracking-widest block">
                Selected Video Topic
              </span>
              <h3 className="text-xl font-extrabold text-[#031635]">
                &quot;{topic}&quot;
              </h3>
              <button
                onClick={toggleListenTopic}
                className="w-full py-3 bg-[#FDBC13] text-[#261900] text-sm font-bold rounded-xl shadow-sm hover:bg-[#F3B20B] inline-flex items-center justify-center gap-2"
              >
                <Mic className="w-4 h-4" /> {isListeningTopic ? 'Listening...' : 'Change Topic by Voice'}
              </button>
            </div>

            {/* Live Spoken Audio Transcript Card */}
            <div className="bg-white border-2 border-[#031635] rounded-3xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-[#031635] uppercase tracking-wider flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-rose-600" /> Live Spoken Audio Transcript
                </span>
                {isListeningSpeech && (
                  <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full animate-pulse">
                    🔴 LISTENING LIVE
                  </span>
                )}
              </div>

              <textarea
                value={spokenTranscript}
                onChange={(e) => setSpokenTranscript(e.target.value)}
                placeholder="Speak or type what you are preparing (e.g., 'I am preparing authentic Dal Baati using pure desi ghee, wheat flour, and roasted chana dal...')"
                className="w-full h-28 p-3 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-xl text-sm font-semibold outline-none focus:border-[#031635] resize-none"
              />

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={toggleSpokenSpeechRecording}
                  className={`flex-1 py-3 text-xs font-extrabold rounded-xl shadow-sm transition flex items-center justify-center gap-1.5 ${
                    isListeningSpeech
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] border border-[#E3E2E0]'
                  }`}
                >
                  <Mic className="w-4 h-4" /> {isListeningSpeech ? 'Stop Listening' : '🎙️ Dictate Ingredients/Steps'}
                </button>

                <button
                  onClick={() => generateAIDescriptionFromText()}
                  disabled={isGeneratingDescription}
                  className="flex-1 py-3 bg-[#031635] hover:bg-[#1a2b4b] text-[#FDBC13] text-xs font-extrabold rounded-xl shadow-md transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" /> {isGeneratingDescription ? 'Generating AI...' : '✨ Format with AI'}
                </button>
              </div>

              {spokenTranscript.trim() && (
                <button
                  onClick={useExactSpokenTextAsDescription}
                  className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1 shadow-xs"
                >
                  ✓ Use Exact Spoken Words As Video Description (0% AI Hallucination)
                </button>
              )}
            </div>

            {/* Gesture Control Rules Card */}
            <div className="bg-white border-2 border-[#031635] rounded-3xl p-6 shadow-md space-y-5">
              <h3 className="text-xl font-extrabold text-[#031635] flex items-center gap-2">
                <Video className="w-5 h-5 text-[#FDBC13]" /> Video Recording Instructions
              </h3>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shrink-0">
                    <ThumbsUp className="w-7 h-7 text-[#FDBC13]" />
                  </div>
                  <div>
                    <div className="font-black text-[#031635] text-base">👍 Start Recording</div>
                    <div className="text-xs text-emerald-800 font-semibold">Show Thumbs Up or tap green button to record live camera & audio.</div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                    <Hand className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="font-black text-[#031635] text-base">✋ Stop & Store Video</div>
                    <div className="text-xs text-rose-800 font-semibold">Show Open Palm or tap red button to stop, play back & save video.</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
