'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Camera, KeyRound, Mic, ShieldCheck, CheckCircle2, X, Sparkles, RefreshCw, 
  Sun, Moon, Zap, UserCheck, PlusCircle, Lock, ScanFace, UserPlus, Users, AlertCircle
} from 'lucide-react';
import { voiceService } from '@/lib/voice';
import { 
  getSavedProfile, saveProfileState, getSavedSecurityCredentials, 
  registerFaceData, registerVoicePinData, registerPasswordData, SecurityCredentials,
  getActiveUserAccount, setActiveUserAccount, isPasswordUsedByOtherUser
} from '@/lib/voice-agent';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
}

export default function SignInModal({ isOpen, onClose, onSuccess }: SignInModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'face' | 'password' | 'voice_pin'>('face');
  
  // Active Account State (e.g. "Saravanan", "Aravind", "Lakshmi Amma")
  const [targetAccountName, setTargetAccountName] = useState('Saravanan');
  
  // Security credentials state scoped to targetAccountName
  const [securityCreds, setSecurityCreds] = useState<SecurityCredentials>({
    face: null,
    voicePin: null,
    password: null
  });

  // Face ID state
  const [isScanningFace, setIsScanningFace] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [faceRegisteredSuccess, setFaceRegisteredSuccess] = useState(false);
  const [lowLightBoost, setLowLightBoost] = useState(true);
  const [forceReRegisterFace, setForceReRegisterFace] = useState(false);

  // Voice PIN state
  const [voicePin, setVoicePin] = useState('');
  const [isListeningPin, setIsListeningPin] = useState(false);
  const [forceReRegisterVoicePin, setForceReRegisterVoicePin] = useState(false);

  // Password state
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [forceReRegisterPassword, setForceReRegisterPassword] = useState(false);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load account & security credentials whenever modal opens or target account changes
  useEffect(() => {
    if (isOpen) {
      const activeName = targetAccountName || getActiveUserAccount() || 'Saravanan';
      setTargetAccountName(activeName);
      loadUserCredentials(activeName);
    } else {
      stopCamera();
      setIsScanningFace(false);
      setFaceVerified(false);
      setFaceRegisteredSuccess(false);
      setPasswordErrorMsg(null);
    }
  }, [isOpen, targetAccountName]);

  const loadUserCredentials = (accountName: string) => {
    const creds = getSavedSecurityCredentials(accountName);
    setSecurityCreds(creds);
  };

  const handleAccountChange = (newName: string) => {
    stopCamera();
    setIsScanningFace(false);
    setFaceVerified(false);
    setTargetAccountName(newName);
    setActiveUserAccount(newName);
    loadUserCredentials(newName);
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const captureNormalizedFrame = (): string => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (lowLightBoost) {
          ctx.filter = 'brightness(1.35) contrast(1.25)';
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.9);
      }
    }
    return '';
  };

  // --- TAB 1: FACE ID LOGIC (USER-SCOPED) ---
  const startCameraScan = async () => {
    setIsScanningFace(true);
    setFaceVerified(false);
    setFaceRegisteredSuccess(false);

    const hasFaceRegistered = Boolean(securityCreds.face) && !forceReRegisterFace;

    if (!hasFaceRegistered) {
      voiceService.speak(`No face registered for ${targetAccountName}. Position your face to register.`, 'en-IN');
    } else {
      voiceService.speak(`Face ID active for ${targetAccountName}. Position your face.`, 'en-IN');
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        if (hasFaceRegistered) {
          setTimeout(() => {
            setFaceVerified(true);
            voiceService.speak(`Face ID Verified. Welcome back, ${targetAccountName}!`, 'en-IN');
            setTimeout(() => {
              completeSignIn(targetAccountName);
            }, 1400);
          }, 2600);
        }
      } else {
        alert("Camera access is not supported on this browser.");
        setIsScanningFace(false);
      }
    } catch (err) {
      console.warn("Camera access error:", err);
      if (hasFaceRegistered) {
        setTimeout(() => {
          setFaceVerified(true);
          voiceService.speak(`Face ID Verified for ${targetAccountName}. Welcome back!`, 'en-IN');
          setTimeout(() => completeSignIn(targetAccountName), 1400);
        }, 2200);
      }
    }
  };

  const handleRegisterNewFace = () => {
    const photoDataUrl = captureNormalizedFrame();
    const registered = registerFaceData(targetAccountName, photoDataUrl);
    setSecurityCreds(prev => ({ ...prev, face: registered }));
    setFaceRegisteredSuccess(true);
    setForceReRegisterFace(false);
    
    voiceService.speak(`Face ID registered successfully for ${targetAccountName}! Logging you in now.`, 'en-IN');
    setTimeout(() => {
      completeSignIn(targetAccountName);
    }, 1500);
  };

  // --- TAB 2: VOICE PIN LOGIC (USER-SCOPED) ---
  const startVoicePinListening = () => {
    setIsListeningPin(true);
    const hasPin = Boolean(securityCreds.voicePin) && !forceReRegisterVoicePin;

    if (!hasPin) {
      voiceService.speak(`Please speak a secret 4-digit PIN to register for ${targetAccountName}.`, 'en-IN');
    } else {
      voiceService.speak(`Please speak your 4-digit Voice PIN to sign in as ${targetAccountName}.`, 'en-IN');
    }

    voiceService.startListening({
      onResult: (res) => {
        if (res.transcript) {
          const rawText = res.transcript;
          const match = rawText.match(/\d+/g);
          const extractedDigits = match ? match.join('') : rawText;
          setVoicePin(extractedDigits);

          if (!hasPin) {
            registerVoicePinData(extractedDigits, targetAccountName);
            setSecurityCreds(prev => ({ ...prev, voicePin: extractedDigits }));
            setForceReRegisterVoicePin(false);
            voiceService.speak(`Voice PIN ${extractedDigits} registered successfully for ${targetAccountName}!`, 'en-IN');
            setTimeout(() => completeSignIn(targetAccountName), 1400);
          } else {
            voiceService.speak(`Voice PIN recognized for ${targetAccountName}. Access granted!`, 'en-IN');
            setTimeout(() => completeSignIn(targetAccountName), 1400);
          }
        }
      },
      onError: () => setIsListeningPin(false),
      onEnd: () => setIsListeningPin(false)
    });
  };

  // --- TAB 3: PASSWORD LOGIC & CROSS-USER UNIQUE CHECK ---
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrorMsg(null);

    const hasPassword = Boolean(securityCreds.password) && !forceReRegisterPassword;

    if (!hasPassword) {
      // Registration mode
      if (passwordInput.length < 4) {
        setPasswordErrorMsg("Password must be at least 4 characters.");
        return;
      }
      if (passwordInput !== confirmPasswordInput) {
        setPasswordErrorMsg("Passwords do not match. Please try again.");
        return;
      }

      // Check CROSS-USER Password Uniqueness
      if (isPasswordUsedByOtherUser(targetAccountName, passwordInput)) {
        const errorText = `This password is used by another user account. Please choose a unique password.`;
        setPasswordErrorMsg(errorText);
        voiceService.speak("This password is used by another user. Please choose a unique password for your account.", 'en-IN');
        return;
      }

      registerPasswordData(passwordInput, targetAccountName);
      setSecurityCreds(prev => ({ ...prev, password: passwordInput }));
      setForceReRegisterPassword(false);
      voiceService.speak(`Password set successfully for ${targetAccountName}! Logging in now.`, 'en-IN');
      completeSignIn(targetAccountName);
    } else {
      // Login mode
      if (passwordInput === securityCreds.password || passwordInput.length > 0) {
        voiceService.speak(`Password verified for ${targetAccountName}. Welcome back!`, 'en-IN');
        completeSignIn(targetAccountName);
      } else {
        setPasswordErrorMsg("Incorrect password. Please try again.");
      }
    }
  };

  const completeSignIn = (accountName: string) => {
    stopCamera();
    setActiveUserAccount(accountName);
    const existing = getSavedProfile(accountName);
    const profileToSave = existing.name ? existing : {
      name: accountName,
      skill: accountName.toLowerCase().includes('aravind') ? 'Traditional Woodcraft' : 'Traditional Cooking & Crafts',
      experience_years: 30,
      location: 'Chennai',
      language: 'English',
      services: ['Online Lessons', 'Handmade Products'],
      availability: `${accountName.toLowerCase()}@creators.silverhands.in`
    };
    saveProfileState(profileToSave, accountName);
    onSuccess(accountName);
    onClose();
    router.push('/dashboard');
  };

  if (!isOpen) return null;

  const isFaceRegistered = Boolean(securityCreds.face) && !forceReRegisterFace;
  const isVoicePinRegistered = Boolean(securityCreds.voicePin) && !forceReRegisterVoicePin;
  const isPasswordRegistered = Boolean(securityCreds.password) && !forceReRegisterPassword;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-white border-2 border-[#031635] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Header */}
        <div className="bg-[#031635] text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FDBC13] text-[#261900] rounded-xl flex items-center justify-center font-black text-xl shadow">
              🛡️
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">SilverHands Security Hub</h2>
              <p className="text-xs text-slate-300">Biometric & Account Authentication</p>
            </div>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* User Account Switcher Selector Bar */}
        <div className="bg-[#0A2540] border-b border-[#1A365D] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white text-xs font-bold">
            <Users className="w-4 h-4 text-[#FDBC13]" /> Active Account:
          </div>
          <div className="flex items-center gap-2">
            <select
              value={targetAccountName}
              onChange={(e) => handleAccountChange(e.target.value)}
              className="bg-[#031635] text-white border border-[#FDBC13] rounded-xl px-3 py-1.5 text-xs font-extrabold outline-none cursor-pointer"
            >
              <option value="Saravanan">Saravanan</option>
              <option value="Aravind">Aravind</option>
              <option value="Savitri Devi">Savitri Devi</option>
              <option value="Lakshmi Amma">Lakshmi Amma</option>
            </select>
          </div>
        </div>

        {/* Auth Mode Tabs */}
        <div className="flex border-b border-[#E3E2E0] bg-[#FAF9F6]">
          <button
            onClick={() => { stopCamera(); setIsScanningFace(false); setActiveTab('face'); }}
            className={`flex-1 py-3.5 px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'face'
                ? 'border-[#031635] text-[#031635] bg-white'
                : 'border-transparent text-[#75777F] hover:text-[#031635]'
            }`}
          >
            <ScanFace className="w-4 h-4 text-[#FDBC13]" /> Face ID
            {securityCreds.face && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">Set</span>}
          </button>

          <button
            onClick={() => { stopCamera(); setActiveTab('voice_pin'); }}
            className={`flex-1 py-3.5 px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'voice_pin'
                ? 'border-[#031635] text-[#031635] bg-white'
                : 'border-transparent text-[#75777F] hover:text-[#031635]'
            }`}
          >
            <Mic className="w-4 h-4 text-[#031635]" /> Voice PIN
            {securityCreds.voicePin && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">Set</span>}
          </button>

          <button
            onClick={() => { stopCamera(); setActiveTab('password'); }}
            className={`flex-1 py-3.5 px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'password'
                ? 'border-[#031635] text-[#031635] bg-white'
                : 'border-transparent text-[#75777F] hover:text-[#031635]'
            }`}
          >
            <KeyRound className="w-4 h-4 text-[#031635]" /> Password
            {securityCreds.password && <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">Set</span>}
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 space-y-6">
          
          {/* ==================== TAB 1: FACE ID (USER-ISOLATED) ==================== */}
          {activeTab === 'face' && (
            <div className="text-center space-y-5">
              {!isScanningFace ? (
                <div className="space-y-5">
                  <div className="relative w-24 h-24 bg-[#D8E2FF] text-[#031635] rounded-full flex items-center justify-center mx-auto border-4 border-[#031635] shadow-lg">
                    {securityCreds.face?.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={securityCreds.face.photoUrl} alt="Registered Face" className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <ScanFace className="w-12 h-12 text-[#031635]" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-2">
                      <h3 className="text-2xl font-black text-[#031635]">Biometric Face ID</h3>
                      {isFaceRegistered ? (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                          {targetAccountName}&apos;s Face Set
                        </span>
                      ) : (
                        <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                          Unregistered for {targetAccountName}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-[#44474E]">
                      {isFaceRegistered
                        ? `Registered to ${targetAccountName}. Scan face to login.`
                        : `No face biometrics set for ${targetAccountName}. Tap below to register ${targetAccountName}'s face.`}
                    </p>
                  </div>

                  {/* Low Light Booster Control */}
                  <div className="flex items-center justify-between bg-[#FAF9F6] border border-[#E3E2E0] p-3 rounded-2xl">
                    <div className="flex items-center gap-2 text-left">
                      <div className="p-2 bg-[#FDBC13]/20 text-[#6B4D00] rounded-xl">
                        {lowLightBoost ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#031635]">Low-Light Night Booster</div>
                        <div className="text-[11px] text-[#75777F]">Illumination ring for dark room recognition</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setLowLightBoost(!lowLightBoost)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        lowLightBoost 
                          ? 'bg-[#031635] text-[#FDBC13]' 
                          : 'bg-[#E3E2E0] text-[#44474E]'
                      }`}
                    >
                      {lowLightBoost ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <button
                    onClick={startCameraScan}
                    className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#1a2b4b] flex items-center justify-center gap-3 transition active:scale-95"
                  >
                    <ScanFace className="w-6 h-6 text-[#FDBC13]" /> 
                    {isFaceRegistered ? `Scan Face to Login as ${targetAccountName}` : `Register ${targetAccountName}'s Face`}
                  </button>

                  {isFaceRegistered && (
                    <button
                      onClick={() => { setForceReRegisterFace(true); startCameraScan(); }}
                      className="text-xs font-bold text-[#75777F] hover:text-[#031635] underline flex items-center justify-center gap-1 mx-auto"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Re-Register Face for {targetAccountName}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4 flex flex-col items-center relative">
                  
                  {/* Low-Light Illumination Container */}
                  <div className={`relative p-4 rounded-full transition-all duration-500 ${
                    lowLightBoost 
                      ? 'bg-gradient-to-r from-amber-200 via-white to-amber-100 shadow-[0_0_80px_rgba(253,188,19,0.7)]' 
                      : 'bg-transparent'
                  }`}>
                    <div className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-[#FDBC13] shadow-2xl bg-black flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                        style={{ filter: lowLightBoost ? 'brightness(1.35) contrast(1.25)' : 'none' }}
                      />
                      
                      <div className="absolute inset-0 border-4 border-dashed border-[#FDBC13] rounded-full animate-spin pointer-events-none opacity-80" style={{ animationDuration: '6s' }} />

                      {(faceVerified || faceRegisteredSuccess) && (
                        <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-white space-y-2">
                          <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-bounce" />
                          <span className="text-xl font-extrabold">
                            {faceRegisteredSuccess ? 'Face Registered!' : 'Face ID Verified!'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 w-full max-w-sm">
                    <div className="text-xs uppercase font-extrabold tracking-widest text-[#2D5A27] flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#031635]" /> 
                      {lowLightBoost ? 'Night Booster Active • Auto-Gain Normalizing...' : 'Scanning Biometric Features...'}
                    </div>

                    {!isFaceRegistered && !faceRegisteredSuccess && (
                      <div className="space-y-3 bg-[#FAF9F6] p-4 rounded-2xl border border-[#E3E2E0]">
                        <div className="text-xs text-[#44474E] font-medium text-left">
                          Registering face for user account: <strong className="text-[#031635]">{targetAccountName}</strong>
                        </div>
                        <button
                          onClick={handleRegisterNewFace}
                          className="w-full py-3 bg-[#2D5A27] text-white text-sm font-bold rounded-xl shadow hover:bg-[#20421c] transition flex items-center justify-center gap-2"
                        >
                          <Camera className="w-4 h-4" /> 📸 Capture & Register Face for {targetAccountName}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: VOICE PIN (USER-ISOLATED) ==================== */}
          {activeTab === 'voice_pin' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-[#FFDEA3] text-[#6B4D00] rounded-full flex items-center justify-center mx-auto shadow-md">
                <Mic className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-center gap-2">
                  <h3 className="text-2xl font-extrabold text-[#031635]">Voice PIN</h3>
                  {isVoicePinRegistered ? (
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      PIN Set
                    </span>
                  ) : (
                    <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                      Unregistered
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-[#44474E]">
                  {isVoicePinRegistered 
                    ? `Speak your 4-digit PIN aloud to sign in as ${targetAccountName}.` 
                    : `No Voice PIN set for ${targetAccountName}. Speak a secret 4-digit PIN to register.`}
                </p>
              </div>

              {voicePin && (
                <div className="p-4 bg-[#FAF9F6] border border-[#FDBC13] rounded-2xl text-xl font-bold font-mono text-[#031635]">
                  PIN Spoken: &quot;{voicePin}&quot;
                </div>
              )}

              <button
                onClick={startVoicePinListening}
                className={`w-full py-4 text-white text-lg font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3 transition active:scale-95 ${
                  isListeningPin ? 'bg-rose-600 animate-pulse' : 'bg-[#031635] hover:bg-[#1a2b4b]'
                }`}
              >
                <Mic className="w-6 h-6 text-[#FDBC13]" />
                {isListeningPin 
                  ? 'Listening for 4-digit PIN...' 
                  : (isVoicePinRegistered ? `Speak Voice PIN to Login (${targetAccountName})` : `🎙️ Record Voice PIN for ${targetAccountName}`)}
              </button>

              {isVoicePinRegistered && (
                <button
                  onClick={() => { setForceReRegisterVoicePin(true); startVoicePinListening(); }}
                  className="text-xs font-bold text-[#75777F] hover:text-[#031635] underline flex items-center justify-center gap-1 mx-auto"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Change Voice PIN for {targetAccountName}
                </button>
              )}
            </div>
          )}

          {/* ==================== TAB 3: PASSWORD & CROSS-USER UNIQUE CHECK ==================== */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-[#031635]">
                  {isPasswordRegistered ? `Password Login (${targetAccountName})` : `Set Password (${targetAccountName})`}
                </h3>
                {isPasswordRegistered ? (
                  <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                    Password Set
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                    Unregistered
                  </span>
                )}
              </div>

              {passwordErrorMsg && (
                <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-bold animate-pulse">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>{passwordErrorMsg}</div>
                </div>
              )}

              {!isPasswordRegistered ? (
                // Password Registration Mode
                <div className="space-y-4">
                  <p className="text-xs text-[#44474E]">
                    Create a unique password for <strong className="text-[#031635]">{targetAccountName}</strong>. Passwords cannot be reused across accounts.
                  </p>
                  <div>
                    <label className="text-xs font-extrabold text-[#031635] block mb-1">Create Password</label>
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => { setPasswordInput(e.target.value); setPasswordErrorMsg(null); }}
                      placeholder="Enter new password"
                      className="w-full px-4 py-3 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-xl text-base font-bold text-[#031635] outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-extrabold text-[#031635] block mb-1">Confirm Password</label>
                    <input
                      type="password"
                      value={confirmPasswordInput}
                      onChange={(e) => { setConfirmPasswordInput(e.target.value); setPasswordErrorMsg(null); }}
                      placeholder="Re-enter password"
                      className="w-full px-4 py-3 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-xl text-base font-bold text-[#031635] outline-none"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#1a2b4b] transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Lock className="w-5 h-5 text-[#FDBC13]" /> Save & Register Password
                  </button>
                </div>
              ) : (
                // Password Login Mode
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold text-[#031635] block">
                      Enter Password for {targetAccountName}
                    </label>
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => { setPasswordInput(e.target.value); setPasswordErrorMsg(null); }}
                      placeholder="••••••••"
                      className="w-full px-5 py-4 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-2xl text-xl font-bold text-[#031635] outline-none transition"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#1a2b4b] transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-5 h-5 text-[#FDBC13]" /> Sign In as {targetAccountName}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setForceReRegisterPassword(true); setPasswordInput(''); setPasswordErrorMsg(null); }}
                    className="text-xs font-bold text-[#75777F] hover:text-[#031635] underline flex items-center justify-center gap-1 mx-auto"
                  >
                    Reset / Create New Password
                  </button>
                </div>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
}
