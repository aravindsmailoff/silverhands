'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { voiceService } from '@/lib/voice';
import { 
  registerFaceData, registerVoicePinData, registerPasswordData, 
  saveProfileState, setActiveUserAccount, isPasswordUsedByOtherUser 
} from '@/lib/voice-agent';
import { 
  ShieldCheck, Mic, Camera, KeyRound, CheckCircle2, ArrowRight, RefreshCw, ScanFace, Lock, AlertCircle 
} from 'lucide-react';

export default function CreateAccountOnboardingPage() {
  const router = useRouter();

  // Onboarding Wizard Steps: 1 = Name/Skill, 2 = Voice PIN, 3 = Face ID, 4 = Password
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // User input states
  const [name, setName] = useState('');
  const [skill, setSkill] = useState('Traditional Cooking & Crafts');
  const [isListeningName, setIsListeningName] = useState(false);

  // Voice PIN state
  const [voicePin, setVoicePin] = useState('');
  const [isListeningPin, setIsListeningPin] = useState(false);

  // Face ID state
  const [faceCaptured, setFaceCaptured] = useState(false);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);

  // Password state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Clean up camera stream when moving away from Step 3
  useEffect(() => {
    if (step !== 3) {
      stopCamera();
    }
  }, [step]);

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // Step 1: Voice Name Input
  const toggleVoiceNameRecording = () => {
    if (isListeningName) {
      voiceService.stopListening();
      setIsListeningName(false);
    } else {
      setIsListeningName(true);
      voiceService.speak("Please speak your full name into the microphone.", 'en-IN');
      voiceService.startListening({
        onResult: (res) => {
          if (res.transcript) {
            setName(res.transcript);
          }
        },
        onError: () => setIsListeningName(false),
        onEnd: () => setIsListeningName(false)
      });
    }
  };

  // Step 2: Voice PIN Setup
  const startVoicePinListening = () => {
    setIsListeningPin(true);
    voiceService.speak("Speak a secret 4-digit Voice PIN to secure your account.", 'en-IN');

    voiceService.startListening({
      onResult: (res) => {
        if (res.transcript) {
          const match = res.transcript.match(/\d+/g);
          const digits = match ? match.join('') : res.transcript;
          setVoicePin(digits);
          voiceService.speak(`Voice PIN set to ${digits}.`, 'en-IN');
        }
      },
      onError: () => setIsListeningPin(false),
      onEnd: () => setIsListeningPin(false)
    });
  };

  // Step 3: Face ID Camera Scan
  const startCameraPreview = async () => {
    voiceService.speak("Position your face inside the circle and tap Capture Face.", 'en-IN');
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }
    } catch (e) {
      console.warn("Camera preview error:", e);
    }
  };

  const captureFaceSnapshot = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.filter = 'brightness(1.25) contrast(1.2)';
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedPhotoUrl(dataUrl);
        setFaceCaptured(true);
        stopCamera();
        voiceService.speak("Face ID captured successfully!", 'en-IN');
      }
    }
  };

  // Step 4: Complete Account Creation & Save to Database Registry
  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const userName = name.trim() || 'Senior Creator';

    if (password.length < 4) {
      setErrorMsg("Password must be at least 4 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please try again.");
      return;
    }

    // Enforce Password Uniqueness across accounts
    if (isPasswordUsedByOtherUser(userName, password)) {
      const msg = "This password is used by another user. Please choose a unique password.";
      setErrorMsg(msg);
      voiceService.speak("This password is used by another user. Please choose a unique password.", 'en-IN');
      return;
    }

    // Save Profile State
    saveProfileState({
      name: userName,
      skill: skill,
      experience_years: 30,
      location: 'Chennai',
      language: 'English',
      services: ['Online Classes', 'Handmade Products'],
      availability: `${userName.toLowerCase().replace(/\s+/g, '')}@creators.silverhands.in`
    }, userName);

    // Save Voice PIN
    if (voicePin) {
      registerVoicePinData(voicePin, userName);
    }

    // Save Face ID
    if (capturedPhotoUrl) {
      registerFaceData(userName, capturedPhotoUrl);
    }

    // Save Password
    registerPasswordData(password, userName);

    // Set Active User
    setActiveUserAccount(userName);

    voiceService.speak(`Account created successfully for ${userName}! Loading your dashboard now.`, 'en-IN');
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1A1C1A] flex flex-col font-['Lexend',sans-serif] antialiased">
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Header */}
      <header className="w-full flex items-center justify-between px-5 md:px-10 h-16 pt-2 max-w-screen-md mx-auto">
        <Link href="/" className="flex items-center gap-2 text-[#1A1C1A] hover:bg-[#E9E8E5] rounded-full px-4 py-2 transition min-h-[56px]">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="text-lg font-semibold">Home</span>
        </Link>
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#2D5A27] bg-[#2D5A27]/10 px-3 py-1.5 rounded-full border border-[#2D5A27]/30">
          <ShieldCheck className="w-4 h-4" /> Identity Protection
        </div>
      </header>

      <main className="flex-1 w-full max-w-screen-md mx-auto px-5 md:px-10 py-6 flex flex-col gap-6">
        
        {/* Step Progress Header */}
        <div className="flex items-center justify-center gap-2 mb-2">
          {[1, 2, 3, 4].map(s => (
            <div 
              key={s} 
              className={`h-2.5 rounded-full transition-all ${
                s === step ? 'w-10 bg-[#031635]' : s < step ? 'w-6 bg-[#2D5A27]' : 'w-6 bg-[#E3E2E0]'
              }`} 
            />
          ))}
        </div>

        {/* STEP 1: Name & Skill Registration */}
        {step === 1 && (
          <div className="bg-white border-2 border-[#031635] rounded-3xl p-8 shadow-xl space-y-6 text-center">
            <div className="w-20 h-20 bg-[#031635] text-[#FDBC13] rounded-full flex items-center justify-center mx-auto shadow-md">
              <Mic className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-extrabold text-[#031635]">Create Your Account</h1>
              <p className="text-base text-[#44474E]">Speak or type your full name and expertise.</p>
            </div>

            {/* Voice Recording Circle */}
            <div className="relative w-36 h-36 flex items-center justify-center mx-auto">
              <div className="absolute inset-0 rounded-full bg-[#FDBC13] opacity-20 pulse-ring" />
              <button
                onClick={toggleVoiceNameRecording}
                className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-xl transition active:scale-95 ${
                  isListeningName ? 'bg-rose-600 border-4 border-rose-300' : 'bg-[#031635]'
                }`}
              >
                <Mic className="w-12 h-12 text-[#FDBC13]" />
              </button>
            </div>

            <div className="space-y-4 text-left">
              <div>
                <label className="text-xs font-extrabold text-[#031635] block mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Saravanan or Aravind"
                  className="w-full px-5 py-4 border-2 border-[#E3E2E0] rounded-2xl text-xl font-bold text-[#031635] outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#031635] block mb-1">Your Skill or Specialty</label>
                <input
                  type="text"
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  placeholder="e.g. Traditional Cooking, Woodcraft, Tutoring"
                  className="w-full px-5 py-3 border-2 border-[#E3E2E0] rounded-2xl text-base font-bold text-[#031635] outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (!name.trim()) { alert("Please enter or speak your name."); return; }
                setStep(2);
                voiceService.speak(`Thank you, ${name}. Next, create your 4-digit Voice PIN.`, 'en-IN');
              }}
              className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#1a2b4b] flex items-center justify-center gap-2"
            >
              Continue to Voice PIN <ArrowRight className="w-5 h-5 text-[#FDBC13]" />
            </button>
          </div>
        )}

        {/* STEP 2: 4-Digit Voice PIN Registration */}
        {step === 2 && (
          <div className="bg-white border-2 border-[#031635] rounded-3xl p-8 shadow-xl space-y-6 text-center">
            <div className="w-20 h-20 bg-[#FFDEA3] text-[#6B4D00] rounded-full flex items-center justify-center mx-auto shadow-md">
              <Mic className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold text-[#031635]">Create Voice PIN</h2>
              <p className="text-base text-[#44474E]">
                Speak or type a 4-digit secret PIN for <strong className="text-[#031635]">{name}</strong>.
              </p>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-[#FAF9F6] border-2 border-[#FDBC13] rounded-2xl text-3xl font-extrabold font-mono text-[#031635]">
                {voicePin ? `PIN: ${voicePin}` : "••••"}
              </div>

              <button
                onClick={startVoicePinListening}
                className={`w-full py-4 text-white text-lg font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3 transition active:scale-95 ${
                  isListeningPin ? 'bg-rose-600 animate-pulse' : 'bg-[#031635] hover:bg-[#1a2b4b]'
                }`}
              >
                <Mic className="w-6 h-6 text-[#FDBC13]" />
                {isListeningPin ? 'Listening for 4 digits...' : '🎙️ Speak 4-Digit Voice PIN'}
              </button>

              <div>
                <label className="text-xs font-bold text-[#75777F] block mb-1">Or Enter PIN Manually</label>
                <input
                  type="text"
                  maxLength={4}
                  value={voicePin}
                  onChange={(e) => setVoicePin(e.target.value)}
                  placeholder="4242"
                  className="w-full px-5 py-3 border-2 border-[#E3E2E0] rounded-2xl text-center font-mono text-xl font-bold text-[#031635]"
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setStep(1)} className="w-1/3 py-4 bg-[#E3E2E0] text-[#031635] font-bold rounded-2xl">
                Back
              </button>
              <button
                onClick={() => {
                  if (!voicePin) { alert("Please set a 4-digit Voice PIN."); return; }
                  setStep(3);
                  startCameraPreview();
                }}
                className="w-2/3 py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"
              >
                Continue to Face ID <ArrowRight className="w-5 h-5 text-[#FDBC13]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Face ID Registration */}
        {step === 3 && (
          <div className="bg-white border-2 border-[#031635] rounded-3xl p-8 shadow-xl space-y-6 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold text-[#031635]">Register Face ID</h2>
              <p className="text-base text-[#44474E]">Position face inside circle for biometric capture.</p>
            </div>

            <div className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-[#FDBC13] shadow-2xl bg-black mx-auto flex items-center justify-center">
              {!faceCaptured ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
                  <div className="absolute inset-0 border-4 border-dashed border-[#FDBC13] rounded-full animate-spin opacity-80" style={{ animationDuration: '6s' }} />
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={capturedPhotoUrl || ''} alt="Captured Face" className="w-full h-full object-cover" />
              )}
            </div>

            {!faceCaptured ? (
              <button
                onClick={captureFaceSnapshot}
                className="w-full py-4 bg-[#2D5A27] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#20421c] flex items-center justify-center gap-3"
              >
                <Camera className="w-6 h-6" /> 📸 Capture Face ID Snapshot
              </button>
            ) : (
              <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm font-extrabold rounded-2xl flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Face ID Snapshot Captured!
              </div>
            )}

            <div className="flex gap-4">
              <button onClick={() => setStep(2)} className="w-1/3 py-4 bg-[#E3E2E0] text-[#031635] font-bold rounded-2xl">
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="w-2/3 py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2"
              >
                Continue to Password <ArrowRight className="w-5 h-5 text-[#FDBC13]" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Password Setup & Final Save */}
        {step === 4 && (
          <form onSubmit={handleFinalSubmit} className="bg-white border-2 border-[#031635] rounded-3xl p-8 shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-[#031635] text-[#FDBC13] rounded-full flex items-center justify-center mx-auto shadow-md">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-3xl font-extrabold text-[#031635]">Set Account Password</h2>
              <p className="text-base text-[#44474E]">Create a fallback password for <strong className="text-[#031635]">{name}</strong>.</p>
            </div>

            {errorMsg && (
              <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-bold animate-pulse">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>{errorMsg}</div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-xs font-extrabold text-[#031635] block mb-1">Create Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(null); }}
                  placeholder="Enter password"
                  className="w-full px-5 py-3 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-2xl text-lg font-bold text-[#031635] outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-[#031635] block mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setErrorMsg(null); }}
                  placeholder="Re-enter password"
                  className="w-full px-5 py-3 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-2xl text-lg font-bold text-[#031635] outline-none"
                  required
                />
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button type="button" onClick={() => setStep(3)} className="w-1/3 py-4 bg-[#E3E2E0] text-[#031635] font-bold rounded-2xl">
                Back
              </button>
              <button
                type="submit"
                className="w-2/3 py-4 bg-[#2D5A27] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#20421c] flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-6 h-6" /> Save Account & Open Dashboard
              </button>
            </div>
          </form>
        )}

      </main>
    </div>
  );
}
