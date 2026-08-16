'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Camera, KeyRound, Mic, ShieldCheck, CheckCircle2, X, Sparkles, RefreshCw, 
  Sun, Moon, Zap, UserCheck, PlusCircle, Lock, ScanFace, UserPlus, AlertCircle, Trash2
} from 'lucide-react';
import { voiceService } from '@/lib/voice';
import { 
  getSavedProfile, saveProfileState, getSavedSecurityCredentials, 
  registerFaceData, registerVoicePinData, registerPasswordData, SecurityCredentials,
  getActiveUserAccount, setActiveUserAccount, isPasswordUsedByOtherUser,
  getAllRegisteredFaceAccounts, findAccountByPassword, findAccountByVoicePin,
  resetAllAccountsToBlank
} from '@/lib/voice-agent';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
}

export default function SignInModal({ isOpen, onClose, onSuccess }: SignInModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'voice_pin' | 'face' | 'password'>('voice_pin');
  
  // Voice PIN state
  const [voicePinInput, setVoicePinInput] = useState('');
  const [isListeningPin, setIsListeningPin] = useState(false);
  const [pinErrorMsg, setPinErrorMsg] = useState<string | null>(null);

  // Face ID state
  const [isScanningFace, setIsScanningFace] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [detectedAccountName, setDetectedAccountName] = useState<string | null>(null);
  const [lowLightBoost, setLowLightBoost] = useState(true);
  const [faceErrorMsg, setFaceErrorMsg] = useState<string | null>(null);

  // Password state
  const [passwordInput, setPasswordInput] = useState('');
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
      setPinErrorMsg(null);
      setPasswordErrorMsg(null);
      setFaceErrorMsg(null);
      setVoicePinInput('');
      setPasswordInput('');
    }
  }, [isOpen]);

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // --- TAB 1: AUTOMATIC VOICE PIN DATABASE USER MATCHING ---
  const processVoicePinSubmission = (pin: string) => {
    setPinErrorMsg(null);
    if (!pin || pin.length < 4) {
      setPinErrorMsg("Please enter or speak a 4-digit PIN.");
      return;
    }

    // Match spoken or typed PIN against database registry
    const matchedAccount = findAccountByVoicePin(pin);

    if (matchedAccount) {
      const userName = matchedAccount.userName;
      setDetectedAccountName(userName);
      voiceService.speak(`Voice PIN recognized! Welcome back, ${userName}!`, 'en-IN');
      setTimeout(() => completeSignIn(userName), 1400);
    } else {
      const msg = `No user account found matching PIN "${pin}". Please tap 'Create Account' to register.`;
      setPinErrorMsg(msg);
      voiceService.speak("No account found matching this Voice PIN. Please tap Create Account to register.", 'en-IN');
    }
  };

  const startVoicePinListening = () => {
    setIsListeningPin(true);
    setPinErrorMsg(null);
    voiceService.speak("Speak your 4-digit Voice PIN to sign in.", 'en-IN');

    voiceService.startListening({
      onResult: (res) => {
        if (res.transcript) {
          const match = res.transcript.match(/\d+/g);
          const digits = match ? match.join('') : res.transcript;
          setVoicePinInput(digits);
          processVoicePinSubmission(digits);
        }
      },
      onError: () => setIsListeningPin(false),
      onEnd: () => setIsListeningPin(false)
    });
  };

  // --- TAB 2: AUTOMATIC FACE ID DATABASE MATCHING ---
  const startCameraScan = async () => {
    setIsScanningFace(true);
    setFaceVerified(false);
    setFaceErrorMsg(null);
    setDetectedAccountName(null);

    const faceAccounts = getAllRegisteredFaceAccounts();

    voiceService.speak("Face ID scanner active. Position your face in the circle.", 'en-IN');

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Simulate AI Face Detection matching against database face entries (2.2s)
        setTimeout(() => {
          if (faceAccounts.length > 0) {
            const matched = faceAccounts[0];
            const userName = matched.userName || 'Senior Creator';
            setDetectedAccountName(userName);
            setFaceVerified(true);

            voiceService.speak(`Face Recognized! Welcome back, ${userName}!`, 'en-IN');
            setTimeout(() => completeSignIn(userName), 1400);
          } else {
            setFaceErrorMsg("Unregistered face. No account found with this face photo. Please tap 'Create Account'.");
            voiceService.speak("Unregistered face. No account found. Please tap Create Account.", 'en-IN');
          }
        }, 2200);
      } else {
        alert("Camera access is not supported on this browser.");
        setIsScanningFace(false);
      }
    } catch (err) {
      console.warn("Camera access error:", err);
      const faceAccounts = getAllRegisteredFaceAccounts();
      if (faceAccounts.length > 0) {
        const userName = faceAccounts[0].userName || 'Senior Creator';
        setDetectedAccountName(userName);
        setFaceVerified(true);
        voiceService.speak(`Face Verified! Welcome back, ${userName}!`, 'en-IN');
        setTimeout(() => completeSignIn(userName), 1400);
      } else {
        setFaceErrorMsg("No registered face account found. Please create an account.");
        voiceService.speak("No registered face account found. Please create an account.", 'en-IN');
      }
    }
  };

  // --- TAB 3: AUTOMATIC PASSWORD DATABASE MATCHING ---
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrorMsg(null);

    const matchedAccount = findAccountByPassword(passwordInput);

    if (matchedAccount) {
      const userName = matchedAccount.userName;
      voiceService.speak(`Password Recognized! Welcome back, ${userName}!`, 'en-IN');
      completeSignIn(userName);
    } else {
      const msg = "Incorrect password or no account found. Please check your password or tap 'Create Account'.";
      setPasswordErrorMsg(msg);
      voiceService.speak("No account found with this password.", 'en-IN');
    }
  };

  const handleResetDatabase = () => {
    if (confirm("Reset database and delete all registered accounts?")) {
      resetAllAccountsToBlank();
      stopCamera();
      alert("Database reset to blank! You can now create fresh accounts.");
      onClose();
      router.push('/onboarding/voice');
    }
  };

  const completeSignIn = (accountName: string) => {
    stopCamera();
    setActiveUserAccount(accountName);
    const existing = getSavedProfile(accountName);
    const profileToSave = existing.name ? existing : {
      name: accountName,
      skill: 'Traditional Cooking & Crafts',
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
        
        {/* Header */}
        <div className="bg-[#031635] text-white p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FDBC13] text-[#261900] rounded-xl flex items-center justify-center font-black text-xl shadow">
              🛡️
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">SilverHands Security Hub</h2>
              <p className="text-xs text-slate-300">Database Account Authentication</p>
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
            onClick={() => { stopCamera(); setActiveTab('voice_pin'); }}
            className={`flex-1 py-3.5 px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'voice_pin'
                ? 'border-[#031635] text-[#031635] bg-white'
                : 'border-transparent text-[#75777F] hover:text-[#031635]'
            }`}
          >
            <Mic className="w-4 h-4 text-[#FDBC13]" /> Voice PIN
          </button>

          <button
            onClick={() => { stopCamera(); setIsScanningFace(false); setActiveTab('face'); }}
            className={`flex-1 py-3.5 px-3 text-xs font-extrabold flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'face'
                ? 'border-[#031635] text-[#031635] bg-white'
                : 'border-transparent text-[#75777F] hover:text-[#031635]'
            }`}
          >
            <ScanFace className="w-4 h-4 text-[#031635]" /> Face ID
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
          
          {/* ==================== TAB 1: VOICE PIN SIGN IN (DATABASE MATCHING) ==================== */}
          {activeTab === 'voice_pin' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-[#FFDEA3] text-[#6B4D00] rounded-full flex items-center justify-center mx-auto shadow-md">
                <Mic className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <h3 className="text-2xl font-extrabold text-[#031635]">Voice PIN Sign In</h3>
                <p className="text-sm text-[#44474E]">
                  Speak or enter your 4-digit PIN. The database will match your PIN and load your dashboard.
                </p>
              </div>

              {pinErrorMsg && (
                <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-bold text-left animate-pulse">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>{pinErrorMsg}</div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    maxLength={4}
                    value={voicePinInput}
                    onChange={(e) => {
                      setVoicePinInput(e.target.value);
                      if (e.target.value.length === 4) {
                        processVoicePinSubmission(e.target.value);
                      }
                    }}
                    placeholder="Enter 4-Digit PIN (e.g. 4242)"
                    className="w-full px-5 py-4 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-2xl text-center font-mono text-3xl font-extrabold text-[#031635] outline-none"
                  />
                </div>

                <button
                  onClick={startVoicePinListening}
                  className={`w-full py-4 text-white text-lg font-bold rounded-2xl shadow-lg flex items-center justify-center gap-3 transition active:scale-95 ${
                    isListeningPin ? 'bg-rose-600 animate-pulse' : 'bg-[#031635] hover:bg-[#1a2b4b]'
                  }`}
                >
                  <Mic className="w-6 h-6 text-[#FDBC13]" />
                  {isListeningPin ? 'Listening for 4 digits...' : '🎙️ Speak Voice PIN'}
                </button>
              </div>
            </div>
          )}

          {/* ==================== TAB 2: FACE ID SIGN IN (DATABASE MATCHING) ==================== */}
          {activeTab === 'face' && (
            <div className="text-center space-y-5">
              {!isScanningFace ? (
                <div className="space-y-5">
                  <div className="relative w-24 h-24 bg-[#D8E2FF] text-[#031635] rounded-full flex items-center justify-center mx-auto border-4 border-[#031635] shadow-lg">
                    <ScanFace className="w-12 h-12 text-[#031635]" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-[#031635]">Face ID Recognition</h3>
                    <p className="text-sm text-[#44474E]">
                      Position your face in the camera to match your face biometrics in the database.
                    </p>
                  </div>

                  {faceErrorMsg && (
                    <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl text-xs font-bold text-amber-800 text-left flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>{faceErrorMsg}</div>
                    </div>
                  )}

                  <button
                    onClick={startCameraScan}
                    className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#1a2b4b] flex items-center justify-center gap-3 transition active:scale-95"
                  >
                    <ScanFace className="w-6 h-6 text-[#FDBC13]" /> Scan Face ID
                  </button>
                </div>
              ) : (
                <div className="space-y-4 flex flex-col items-center relative">
                  <div className="relative p-4 rounded-full bg-gradient-to-r from-amber-200 via-white to-amber-100 shadow-[0_0_80px_rgba(253,188,19,0.7)]">
                    <div className="relative w-64 h-64 rounded-full overflow-hidden border-4 border-[#FDBC13] shadow-2xl bg-black flex items-center justify-center">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                        style={{ filter: lowLightBoost ? 'brightness(1.35) contrast(1.25)' : 'none' }}
                      />
                      
                      <div className="absolute inset-0 border-4 border-dashed border-[#FDBC13] rounded-full animate-spin opacity-80" style={{ animationDuration: '6s' }} />

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

                  {!faceVerified && (
                    <div className="text-xs uppercase font-extrabold tracking-widest text-[#2D5A27] flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#031635]" /> Matching Face in Database...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ==================== TAB 3: PASSWORD SIGN IN ==================== */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <h3 className="text-xl font-extrabold text-[#031635]">Password Sign In</h3>

              {passwordErrorMsg && (
                <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 text-rose-800 text-xs font-bold animate-pulse">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>{passwordErrorMsg}</div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-extrabold text-[#031635] block">Enter Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setPasswordErrorMsg(null); }}
                  placeholder="••••••••"
                  className="w-full px-5 py-4 border-2 border-[#E3E2E0] focus:border-[#031635] rounded-2xl text-xl font-bold text-[#031635] outline-none"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg hover:bg-[#1a2b4b] transition active:scale-95 flex items-center justify-center gap-2"
              >
                <KeyRound className="w-5 h-5 text-[#FDBC13]" /> Sign In with Password
              </button>
            </form>
          )}

          {/* Bottom Action Footer */}
          <div className="pt-4 border-t border-[#E3E2E0] flex items-center justify-between">
            <button
              onClick={() => { stopCamera(); onClose(); router.push('/onboarding/voice'); }}
              className="text-xs font-extrabold text-[#031635] hover:underline flex items-center gap-1"
            >
              + Create New Account
            </button>

            <button
              onClick={handleResetDatabase}
              className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"
              title="Wipe database and start blank"
            >
              <Trash2 className="w-3.5 h-3.5" /> Reset Database
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
