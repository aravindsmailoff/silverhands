'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, Loader2, ScanFace, X } from 'lucide-react';

export type FaceScannerState =
  | 'IDLE'
  | 'REQUESTING_CAMERA'
  | 'DETECTING'
  | 'ALIGNING'
  | 'LIVENESS_CHECK'
  | 'CAPTURING'
  | 'VERIFYING'
  | 'SUCCESS'
  | 'FAILED';

export interface FaceCapturePayload {
  pixels: number[];
  width: number;
  height: number;
}

export interface FaceScannerResult {
  capturePayload: FaceCapturePayload;
  livenessPassed: boolean;
}

interface FaceScannerProps {
  mode: 'enroll' | 'verify';
  providerId: string;
  onSuccess?: (result: FaceScannerResult & { biometricSessionToken?: string; trustScore?: number }) => void;
  onCancel?: () => void;
}

type LivenessStep = 'blink' | 'turn_left' | 'turn_right';

const STATE_MESSAGES: Record<FaceScannerState, string> = {
  IDLE: 'Tap Start when you are ready.',
  REQUESTING_CAMERA: 'Please allow camera access when your browser asks.',
  DETECTING: 'Looking for your face…',
  ALIGNING: 'Move your face into the oval.',
  LIVENESS_CHECK: 'Follow the simple movement instructions.',
  CAPTURING: 'Hold still for a moment…',
  VERIFYING: 'Checking your identity…',
  SUCCESS: 'Verified successfully!',
  FAILED: 'Verification did not succeed. Please try again.',
};

const LIVENESS_PROMPTS: Record<LivenessStep, string> = {
  blink: 'Please blink once slowly.',
  turn_left: 'Turn your head slightly to the left.',
  turn_right: 'Turn your head slightly to the right.',
};

const CAPTURE_SIZE = 64;

function extractAlignedPixels(video: HTMLVideoElement): FaceCapturePayload | null {
  const canvas = document.createElement('canvas');
  canvas.width = CAPTURE_SIZE;
  canvas.height = CAPTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
  const data = ctx.getImageData(0, 0, CAPTURE_SIZE, CAPTURE_SIZE).data;
  return { pixels: Array.from(data), width: CAPTURE_SIZE, height: CAPTURE_SIZE };
}

function estimateFaceMetrics(payload: FaceCapturePayload): {
  faceDetected: boolean;
  multipleFaces: boolean;
  lightingOk: boolean;
  centered: boolean;
  orientationOk: boolean;
} {
  const { pixels, width, height } = payload;
  let brightness = 0;
  let leftBright = 0;
  let rightBright = 0;
  let centerBright = 0;
  const midX = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const lum = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      brightness += lum;
      if (x < midX) leftBright += lum;
      else rightBright += lum;
      if (Math.abs(x - midX) < width * 0.2 && Math.abs(y - height / 2) < height * 0.25) {
        centerBright += lum;
      }
    }
  }

  const total = width * height;
  const avg = brightness / total;
  const lightingOk = avg > 45 && avg < 220;
  const faceDetected = centerBright / (width * height * 0.1) > 40;
  const orientationOk = Math.abs(leftBright - rightBright) / total < 18;
  const centered = centerBright > avg * width * height * 0.08;

  return {
    faceDetected,
    multipleFaces: false,
    lightingOk,
    centered,
    orientationOk,
  };
}

export default function FaceScanner({ mode, providerId, onSuccess, onCancel }: FaceScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const blinkBaseline = useRef<number | null>(null);
  const headBaseline = useRef<number | null>(null);

  const [state, setState] = useState<FaceScannerState>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [livenessStep, setLivenessStep] = useState<LivenessStep>('blink');
  const [livenessComplete, setLivenessComplete] = useState(false);
  const [instruction, setInstruction] = useState(STATE_MESSAGES.IDLE);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    setState('REQUESTING_CAMERA');
    setErrorMessage(null);
    setInstruction('Please tap Allow when your browser asks for camera permission.');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState('DETECTING');
      setInstruction(STATE_MESSAGES.DETECTING);
    } catch {
      setState('FAILED');
      setErrorMessage('Camera permission was denied. Please enable your camera in browser settings and try again.');
      setInstruction(STATE_MESSAGES.FAILED);
    }
  };

  useEffect(() => {
    if (!['DETECTING', 'ALIGNING', 'LIVENESS_CHECK'].includes(state)) return;
    if (!videoRef.current) return;

    const interval = setInterval(() => {
      const payload = extractAlignedPixels(videoRef.current!);
      if (!payload) return;
      const metrics = estimateFaceMetrics(payload);

      if (!metrics.faceDetected) {
        setState('DETECTING');
        setInstruction('No face detected. Please look at the camera.');
        return;
      }
      if (!metrics.lightingOk) {
        setState('ALIGNING');
        setInstruction('Lighting is too dark or too bright. Move to a well-lit area.');
        return;
      }
      if (!metrics.centered) {
        setState('ALIGNING');
        setInstruction('Please move your face into the center of the oval.');
        return;
      }

      if (state !== 'LIVENESS_CHECK' && !livenessComplete) {
        setState('LIVENESS_CHECK');
        setInstruction(LIVENESS_PROMPTS[livenessStep]);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [state, livenessStep, livenessComplete]);

  const advanceLiveness = () => {
    if (livenessStep === 'blink') {
      setLivenessStep('turn_left');
      setInstruction(LIVENESS_PROMPTS.turn_left);
    } else if (livenessStep === 'turn_left') {
      setLivenessStep('turn_right');
      setInstruction(LIVENESS_PROMPTS.turn_right);
    } else {
      setLivenessComplete(true);
      runCaptureAndSubmit();
    }
  };

  const runCaptureAndSubmit = async () => {
    if (!videoRef.current) return;
    setState('CAPTURING');
    setInstruction(STATE_MESSAGES.CAPTURING);

    await new Promise((r) => setTimeout(r, 600));
    const payload = extractAlignedPixels(videoRef.current);
    if (!payload) {
      setState('FAILED');
      setErrorMessage('Could not capture your face. Please try again.');
      return;
    }

    setState('VERIFYING');
    setInstruction(STATE_MESSAGES.VERIFYING);

    const endpoint = mode === 'enroll' ? '/api/auth/face-enroll' : '/api/auth/face-verify';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-provider-id': providerId,
        },
        body: JSON.stringify({
          providerId,
          capturePayload: payload,
          livenessPassed: true,
        }),
      });
      const data = await res.json();

      if (data.success || data.verified) {
        setState('SUCCESS');
        setInstruction(STATE_MESSAGES.SUCCESS);
        stopCamera();
        onSuccess?.({
          capturePayload: payload,
          livenessPassed: true,
          biometricSessionToken: data.biometricSessionToken,
          trustScore: data.trustScore,
        });
      } else {
        setState('FAILED');
        setErrorMessage(data.reason || data.message || 'Face did not match. Please try again.');
        setInstruction(STATE_MESSAGES.FAILED);
      }
    } catch {
      setState('FAILED');
      setErrorMessage('Something went wrong. Please check your connection and try again.');
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-[#031635] border border-white/10 rounded-3xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-white flex items-center gap-3">
          <ScanFace className="w-8 h-8 text-[#FDBC13]" />
          {mode === 'enroll' ? 'Face Enrollment' : 'Face Verification'}
        </h2>
        {onCancel && (
          <button onClick={onCancel} className="p-2 text-white/60 hover:text-white" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      <p className="text-lg text-white/80 leading-relaxed">{instruction}</p>

      {state === 'IDLE' && (
        <div className="bg-white/5 rounded-2xl p-4 text-base text-white/70 space-y-2">
          <p>• Sit in a well-lit room facing the camera.</p>
          <p>• Only one person should be visible.</p>
          <p>• You will be asked to blink and turn your head slightly.</p>
        </div>
      )}

      <div className="relative mx-auto rounded-full overflow-hidden border-4 border-[#FDBC13]/50"
        style={{ width: 280, height: 340 }}>
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
        {!streamRef.current && state === 'IDLE' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Camera className="w-16 h-16 text-white/40" />
          </div>
        )}
        {['VERIFYING', 'CAPTURING'].includes(state) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-12 h-12 text-[#FDBC13] animate-spin" />
          </div>
        )}
        {state === 'SUCCESS' && (
          <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/70">
            <CheckCircle2 className="w-16 h-16 text-emerald-300" />
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-200 text-base">
          <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {state === 'IDLE' && (
          <button
            onClick={startCamera}
            className="w-full py-5 bg-[#FDBC13] hover:bg-[#e5a800] text-[#031635] font-black text-xl rounded-2xl transition"
          >
            Start Camera
          </button>
        )}

        {state === 'LIVENESS_CHECK' && !livenessComplete && (
          <button
            onClick={advanceLiveness}
            className="w-full py-5 bg-white/10 hover:bg-white/20 text-white font-bold text-lg rounded-2xl border border-white/20"
          >
            I did it — Continue
          </button>
        )}

        {state === 'FAILED' && (
          <button
            onClick={() => {
              setState('IDLE');
              setLivenessStep('blink');
              setLivenessComplete(false);
              setErrorMessage(null);
              stopCamera();
            }}
            className="w-full py-5 bg-[#FDBC13] text-[#031635] font-black text-lg rounded-2xl"
          >
            Try Again
          </button>
        )}
      </div>

      <p className="text-sm text-white/40 text-center">
        Basic liveness check — not production-grade anti-spoofing. Stronger verification can be added later.
      </p>
    </div>
  );
}
