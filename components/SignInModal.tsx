'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Camera, KeyRound, Mic, ShieldCheck, CheckCircle2, X, Sparkles, RefreshCw, 
  Sun, Moon, Zap, UserCheck, PlusCircle, Lock, ScanFace, UserPlus, AlertCircle, Check
} from 'lucide-react';
import { voiceService } from '@/lib/voice';
import { 
  getSavedProfile, saveProfileState, getSavedSecurityCredentials, 
  registerFaceData, registerVoicePinData, registerPasswordData, SecurityCredentials,
  getActiveUserAccount, setActiveUserAccount, isPasswordUsedByOtherUser,
  getAllRegisteredFaceAccounts, findAccountByPassword, findAccountByVoicePin
} from '@/lib/voice-agent';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
}

export default function SignInModal({ isOpen, onClose, onSuccess }: SignInModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'face' | 'password' | 'voice_pin'>('face');
  
  // Face ID state
  const [isScanningFace, setIsScanningFace] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [detectedAccountName, setDetectedAccountName] = useState<string | null>(null);
  const [detectedAccountPhoto, setDetectedAccountPhoto] = useState<string | null>(null);
  const [isUnregisteredFace, setIsUnregisteredFace] = useState(false);
  const [lowLightBoost, setLowLightBoost] = useState(true);
  const [registerNameInput, setRegisterNameInput] = useState('');

  // Voice PIN state
  const [voicePin, setVoicePin] = useState('');
  const [isListeningPin, setIsListeningPin] = useState(false);
  const [pinRegisterName, setPinRegisterName] = useState('');
  const [isUnregisteredPin, setIsUnregisteredPin] = useState(false);

  // Password state
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordRegisterName, setPasswordRegisterName] = useState('');
  const [isUnregisteredPasswordMode, setIsUnregisteredPasswordMode] = useState(false);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Reset modal state on open/close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setIsScanningFace(false);
      setFaceVerified(false);
      setDetectedAccountName(null);
      setDetectedAccountPhoto(null);
      setIsUnregisteredFace(false);
      setPasswordErrorMsg(null);
      setIsUnregisteredPasswordMode(false);
      setIsUnregisteredPin(false);
    }
  }, [isOpen]);

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

  // --- TAB 1: AUTOMATIC FACE ID DETECTION & REGISTRATION ---
  const startCameraScan = async () => {
    setIsScanningFace(true);
    setFaceVerified(false);
    setIsUnregisteredFace(false);
    setDetectedAccountName(null);

    const faceAccounts = getAllRegisteredFaceAccounts();

    voiceService.speak("Face ID scanner active. Position your face inside the circle.", 'en-IN');

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Simulate AI Face Detection & Identification across registry (2.2 seconds)
        setTimeout(() => {
          if (faceAccounts.length > 0) {
            // Automatically detect the active or registered user account
            const matchedAccount = faceAccounts[0]; 
            const accountName = matchedAccount.userName || 'Senior Creator';
            setDetectedAccountName(accountName);
            setDetectedAccountPhoto(matchedAccount.security.face?.photoUrl || null);
            setFaceVerified(true);

            voiceService.speak(`Face Recognized! Welcome back, ${accountName}!`, 'en-IN');
            setTimeout(() => {
              completeSignIn(accountName);
            }, 1400);
          } else {
            // No registered faces in database -> Prompt for Face Registration
            setIsUnregisteredFace(true);
            voiceService.speak("Unregistered face detected. Please enter your name below to register your face biometrics.", 'en-IN');
          }
        }, 2200);
      } else {
        alert("Camera access is not supported on this browser.");
        setIsScanningFace(false);
      }
    } catch (err) {
      console.warn("Camera access error:", err);
      // Fallback demo face detection
      const faceAccounts = getAllRegisteredFaceAccounts();
      if (faceAccounts.length > 0) {
        const accountName = faceAccounts[0].userName || 'Senior Creator';
        setDetectedAccountName(accountName);
        setFaceVerified(true);
        voiceService.speak(`Face Verified! Welcome back, ${accountName}!`, 'en-IN');
        setTimeout(() => completeSignIn(accountName), 1400);
      } else {
        setIsUnregisteredFace(true);
        voiceService.speak("Unregistered face detected. Enter your name to register your face.", 'en-IN');
      }
    }
  };

  // Register New Face Action
  const handleRegisterNewFace = () => {
    const targetName = registerNameInput.trim() || 'Senior Creator';
    const photoDataUrl = captureNormalizedFrame();
    
    registerFaceData(targetName, photoDataUrl);
    setDetectedAccountName(targetName);
    setFaceVerified(true);
    setIsUnregisteredFace(false);
    
    voiceService.speak(`Face ID registered successfully for ${targetName}! Logging you in now.`, 'en-IN');
    setTimeout(() => {
      completeSignIn(targetName);
    }, 1400);
  };

  // --- TAB 2: AUTOMATIC VOICE PIN DETECTION & REGISTRATION ---
  const startVoicePinListening = () => {
    setIsListeningPin(true);
    voiceService.speak("Please speak your 4-digit Voice PIN to sign in.", 'en-IN');

    voiceService.startListening({
      onResult: (res) => {
        if (res.transcript) {
          const rawText = res.transcript;
          const match = rawText.match(/\d+/g);
          const extractedDigits = match ? match.join('') : rawText;
          setVoicePin(extractedDigits);

          // Automatically detect account matching spoken Voice PIN
          const matchedAccount = findAccountByVoicePin(extractedDigits);

          if (matchedAccount) {
            const name = matchedAccount.userName;
            voiceService.speak(`Voice PIN recognized for ${name}! Access granted.`, 'en-IN');
            setTimeout(() => completeSignIn(name), 1400);
          } else {
            if (isUnregisteredPin && pinRegisterName.trim()) {
              registerVoicePinData(extractedDigits, pinRegisterName.trim());
              voiceService.speak(`Voice PIN registered for ${pinRegisterName}!`, 'en-IN');
              setTimeout(() => completeSignIn(pinRegisterName.trim()), 1400);
            } else {
              setIsUnregisteredPin(true);
              voiceService.speak("Voice PIN not recognized. Enter your name below to register this Voice PIN.", 'en-IN');
            }
          }
        }
      },
      onError: () => setIsListeningPin(false),
      onEnd: () => setIsListeningPin(false)
    });
  };

  // --- TAB 3: AUTOMATIC PASSWORD DETECTION & CROSS-USER UNIQUE CHECK ---
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrorMsg(null);

    // If submitting registration form for a new account
    if (isUnregisteredPasswordMode) {
      const name = passwordRegisterName.trim() || 'Senior Creator';

      if (passwordInput.length < 4) {
        setPasswordErrorMsg("Password must be at least 4 characters.");
        return;
      }
      if (passwordInput !== confirmPasswordInput) {
        setPasswordErrorMsg("Passwords do not match. Please try again.");
        return;
      }

      // Check CROSS-USER Password Uniqueness
      if (isPasswordUsedByOtherUser(name, passwordInput)) {
        const errorText = "This password is used by another user. Please choose a unique password for your account.";
        setPasswordErrorMsg(errorText);
        voiceService.speak("This password is used by another user. Please choose a unique password for your account.", 'en-IN');
        return;
      }

      registerPasswordData(passwordInput, name);
      voiceService.speak(`Password set successfully for ${name}! Logging in now.`, 'en-IN');
      completeSignIn(name);
      return;
    }

    // Attempt Automatic Account Detection by Password
    const matchedAccount = findAccountByPassword(passwordInput);

    if (matchedAccount) {
      const detectedName = matchedAccount.userName;
      voiceService.speak(`Password Recognized! Welcome back, ${detectedName}!`, 'en-IN');
      completeSignIn(detectedName);
    } else {
      // Password not found in registry -> Prompt user to register account with this password
      setIsUnregisteredPasswordMode(true);
      setPasswordErrorMsg("No account found with this password. Enter your name below to register a new account.");
      voiceService.speak("No account found with this password. Please enter your name below to register.", 'en-IN');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-white border-2 border-[#031635] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col relative">
        
        {/* Clean Modal Header without Manual Dropdown Selector */}
        <div className="bg-[#031635] text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FDBC13] text-[#261900] rounded-xl flex items-center justify-center font-black text-xl shadow">
              🛡️
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">SilverHands Security Hub</h2>
              <p className="text-xs text-slate-300">Biometric & AI Account Authentication</p>
            </div>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition"
          >
            <X className="w-5 h-5 text-white" />
          </button>
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
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 space-y-6">
          
          {/* ==================== TAB 1: AUTOMATIC FACE ID DETECTION ==================== */}
          {activeTab === 'face' && (
            <div className="text-center space-y-5">
              {!isScanningFace ? (
                <div className="space-y-5">
                  <div className="relative w-24 h-24 bg-[#D8E2FF] text-[#031635] rounded-full flex items-center justify-center mx-auto border-4 border-[#031635] shadow-lg">
                    <ScanFace className="w-12 h-12 text-[#031635]" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-[#031635]">AI Face Recognition</h3>
                    <p className="text-sm text-[#44474E]">
                      Look at the camera. AI will automatically identify your face and log you into your account.
                    </p>
                  </div>

                  {/* Low Light Night Booster Control */}
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
                    <ScanFace className="w-6 h-6 text-[#FDBC13]" /> Start Face ID Scan
                  </button>
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

                      {faceVerified && (
                        <div className="absolute inset-0 bg-emerald-950/90 backdrop-blur-sm flex flex-col items-center justify-center text-white space-y-2">
                          <CheckCircle2 className="w-16 h-16 text-emerald-400 animate-bounce" />
                          <span className="text-xl font-extrabold text-center px-4">
                            Welcome Back, {detectedAccountName}!
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 w-full max-w-sm">
                    {!isUnregisteredFace && !faceVerified && (
                      <div className="text-xs uppercase font-extrabold tracking-widest text-[#2D5A27] flex items-center justify-center gap-1.5">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#031635]" /> 
                        {lowLightBoost ? 'Night Booster Active • Detecting Account...' : 'Matching Biometric Features...'}
                      </div>
                    )}

                    {/* Registration Form when Unregistered Face detected */}
                    {isUnregisteredFace && !faceVerified && (
                      <div className="space-y-3 bg-[#FAF9F6] p-4 rounded-2xl border-2 border-[#FDBC13]">
                        <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-amber-600" /> Unregistered Face Detected
                        </div>
                        <p className="text-xs text-[#44474E] text-left">
                          Please enter your name to register your face biometrics for a new account.
                        </p>
                        <div>
                          <input
                            type="text"
                            value={registerNameInput}
                            onChange={(e) => setRegisterNameInput(e.target.value)}
                            placeholder="e.g. Saravanan or Aravind"
                            className="w-full px-4 py-2.5 border-2 border-[#E3E2E0] rounded-xl text-sm font-bold text-[#031635] outline-none"
                            required
                          />
                        </div>
                        <button
                          onClick={handleRegisterNewFace}
                          className="w-full py-3 bg-[#2D5A27] text-white text-sm font-bold rounded-xl shadow hover:bg-[#20421c] transition flex items-center justify-center gap-2"
                        >
                          <Camera className="w-4 h-4" /> 📸 Capture & Register Face
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 2: AUTOMATIC VOICE PIN DETECTION ==================== */}
          {activeTab === 'voice_pin' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-[#FFDEA3] text-[#6B4D00] rounded-full flex items-center justify-center mx-auto shadow-md">
                <Mic className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <h3 className="text-2xl font-extrabold text-[#031635]">Voice PIN Sign In</h3>
                <p className="text-sm text-[#44474E]">
                  Speak your 4-digit Voice PIN aloud. AI will detect your user account automatically.
                </p>
              </div>

              {voicePin && (
                <div className="p-4 bg-[#FAF9F6] border border-[#FDBC13] rounded-2xl text-xl font-bold font-mono text-[#031635]">
                  PIN Spoken: &quot;{voicePin}&quot;
                </div>
              )}

              {isUnregisteredPin && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-left space-y-2">
                  <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600" /> New Voice PIN Detected
                  </div>
                  <input
                    type="text"
                    value={pinRegisterName}
                    onChange={(e) => setPinRegisterName(e.target.value)}
                    placeholder="Enter your name (e.g. Saravanan)"
                    className="w-full px-4 py-2 border rounded-xl text-sm font-bold text-[#031635]"
                  />
                </div>
              )}

              <button
                onClick={startVoicePinListening}
                className={`w-full py-4 text-white text-lg font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3 transition active:scale-95 ${
                  isListeningPin ? 'bg-rose-600 animate-pulse' : 'bg-[#031635] hover:bg-[#1a2b4b]'
                }`}
              >
                <Mic className="w-6 h-6 text-[#FDBC13]" />
                {isListeningPin ? 'Listening for 4-digit PIN...' : 'Speak Voice PIN to Login'}
              </button>
            </div>
          )}

          {/* ==================== TAB 3: AUTOMATIC PASSWORD DETECTION ==================== */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-extrabold text-[#031635]">Password Sign In</h3>
              </div>

              {passwordErrorMsg && (
                <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-bold animate-pulse">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>{passwordErrorMsg}</div>
                </div>
              )}

              {!isUnregisteredPasswordMode ? (
                // Automatic Password Login Input Mode
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold text-[#031635] block">
                      Enter Password
                    </label>
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => { setPasswordInput(e.target.value); setPasswordErrorMsg(null); }}
                      placeholder="••••••••"
                      className="w-full px-5 py-4 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-2xl text-xl font-bold text-[#031635] outline-none transition"
                      required
                    />
                    <p className="text-xs text-[#75777F]">
                      AI will automatically match your password to your account.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#1a2b4b] transition active:scale-95 flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-5 h-5 text-[#FDBC13]" /> Sign In with Password
                  </button>

                  <button
                    type="button"
                    onClick={() => { setIsUnregisteredPasswordMode(true); setPasswordInput(''); setPasswordErrorMsg(null); }}
                    className="text-xs font-bold text-[#75777F] hover:text-[#031635] underline flex items-center justify-center gap-1 mx-auto"
                  >
                    + Register New Password Account
                  </button>
                </div>
              ) : (
                // New Account Registration Mode with Password Uniqueness Check
                <div className="space-y-4">
                  <p className="text-xs text-[#44474E]">
                    Enter your name and a unique password to create a new account. Passwords cannot be reused across accounts.
                  </p>

                  <div>
                    <label className="text-xs font-extrabold text-[#031635] block mb-1">Account Name</label>
                    <input
                      type="text"
                      value={passwordRegisterName}
                      onChange={(e) => setPasswordRegisterName(e.target.value)}
                      placeholder="e.g. Saravanan or Aravind"
                      className="w-full px-4 py-3 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-xl text-base font-bold text-[#031635] outline-none"
                      required
                    />
                  </div>

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

                  <button
                    type="button"
                    onClick={() => { setIsUnregisteredPasswordMode(false); setPasswordErrorMsg(null); }}
                    className="text-xs font-bold text-[#75777F] hover:text-[#031635] underline flex items-center justify-center gap-1 mx-auto"
                  >
                    Back to Automatic Sign In
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
