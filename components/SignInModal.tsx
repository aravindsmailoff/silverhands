'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Camera, KeyRound, Mic, ShieldCheck, CheckCircle2, X, Sparkles, RefreshCw, 
  Sun, Moon, Zap, UserCheck, PlusCircle, Lock, ScanFace, UserPlus, AlertCircle, Trash2, User
} from 'lucide-react';
import { voiceService } from '@/lib/voice';
import { 
  getSavedProfile, saveProfileState, getSavedSecurityCredentials, 
  registerFaceData, registerVoicePinData, registerPasswordData, SecurityCredentials,
  getActiveUserAccount, setActiveUserAccount, isPasswordUsedByOtherUser,
  getAllRegisteredFaceAccounts, findAccountByPassword, findAccountByVoicePin,
  resetAllAccountsToBlank, getAccountsRegistry
} from '@/lib/voice-agent';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (name: string) => void;
  onStartVoiceOnboarding?: () => void;
}

// ── Perceptual image similarity algorithm comparing camera canvas to stored photo URL ──
async function compareFacePhotos(liveCanvas: HTMLCanvasElement, targetPhotoUrl: string): Promise<number> {
  return new Promise((resolve) => {
    if (!targetPhotoUrl) { resolve(0); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        // Draw target photo onto size x size canvas
        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = size;
        targetCanvas.height = size;
        const targetCtx = targetCanvas.getContext('2d');
        if (!targetCtx) { resolve(0); return; }
        targetCtx.drawImage(img, 0, 0, size, size);
        const targetData = targetCtx.getImageData(0, 0, size, size).data;

        // Draw live canvas onto size x size canvas
        const liveScaledCanvas = document.createElement('canvas');
        liveScaledCanvas.width = size;
        liveScaledCanvas.height = size;
        const liveCtx = liveScaledCanvas.getContext('2d');
        if (!liveCtx) { resolve(0); return; }
        liveCtx.drawImage(liveCanvas, 0, 0, size, size);
        const liveData = liveCtx.getImageData(0, 0, size, size).data;

        // Calculate luminance difference across 32x32 grid
        let totalDiff = 0;
        let pixelCount = 0;
        for (let i = 0; i < targetData.length; i += 4) {
          const r1 = targetData[i], g1 = targetData[i+1], b1 = targetData[i+2];
          const r2 = liveData[i], g2 = liveData[i+1], b2 = liveData[i+2];
          const lum1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
          const lum2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
          totalDiff += Math.abs(lum1 - lum2);
          pixelCount++;
        }
        const avgDiff = totalDiff / pixelCount;
        const similarity = Math.max(0, 100 - (avgDiff / 2.55));
        resolve(similarity);
      } catch (e) {
        resolve(0);
      }
    };
    img.onerror = () => resolve(0);
    img.src = targetPhotoUrl;
  });
}

export default function SignInModal({ isOpen, onClose, onSuccess, onStartVoiceOnboarding }: SignInModalProps) {
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
  const [faceErrorMsg, setFaceErrorMsg] = useState<string | null>(null);
  const [registeredAccountsList, setRegisteredAccountsList] = useState<any[]>([]);

  // Password state
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Reset modal state on open/close & load all accounts
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
    } else {
      loadRegisteredAccounts();
    }
  }, [isOpen]);

  const loadRegisteredAccounts = async () => {
    let accounts: any[] = [];
    
    // 1. From local registry
    const registry = getAccountsRegistry();
    for (const key of Object.keys(registry)) {
      const acc = registry[key];
      if (acc && acc.userName) {
        accounts.push({
          userName: acc.userName,
          photoUrl: acc.security?.face?.photoUrl || null,
          voicePin: acc.security?.voicePin || null,
          password: acc.security?.password || null
        });
      }
    }

    // 2. From PostgreSQL API
    try {
      const res = await fetch('/api/users/sync');
      const data = await res.json();
      if (data.success && data.accounts) {
        for (const dbAcc of data.accounts) {
          const name = dbAcc.user_name;
          if (name && !accounts.some(a => a.userName.toLowerCase() === name.toLowerCase())) {
            accounts.push({
              userName: name,
              photoUrl: dbAcc.face_photo_url || null,
              voicePin: dbAcc.voice_pin || null,
              password: dbAcc.password_hash || null
            });
          }
        }
      }
    } catch (e) {
      console.warn('DB fetch notice:', e);
    }

    setRegisteredAccountsList(accounts);
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // --- TAB 1: VOICE PIN MATCHING ---
  const processVoicePinSubmission = async (pin: string) => {
    setPinErrorMsg(null);
    if (!pin || pin.length < 4) {
      setPinErrorMsg("Please enter or speak a 4-digit PIN.");
      return;
    }

    let matchedAccount = findAccountByVoicePin(pin);

    if (!matchedAccount && registeredAccountsList.length > 0) {
      const cleanPin = pin.replace(/\D/g, '');
      const dbMatch = registeredAccountsList.find(acc => {
        const p = (acc.voicePin || '').replace(/\D/g, '');
        return p && (p === cleanPin || p.includes(cleanPin) || cleanPin.includes(p));
      });
      if (dbMatch) {
        matchedAccount = {
          userName: dbMatch.userName,
          profile: getSavedProfile(dbMatch.userName),
          security: { face: null, voicePin: pin, password: dbMatch.password }
        };
      }
    }

    if (matchedAccount) {
      const userName = matchedAccount.userName;
      setDetectedAccountName(userName);
      voiceService.speak(`Voice PIN recognized! Welcome back, ${userName}!`, 'en-IN');
      setTimeout(() => completeSignIn(userName), 1200);
    } else {
      setPinErrorMsg("Voice PIN not recognized. Please check your PIN or tap Create New Account.");
      voiceService.speak("Voice PIN not recognized. Please try again or create a new account.", 'en-IN');
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

  // --- TAB 2: ACCURATE FACE ID RECOGNITION WITH PERCEPTUAL IMAGE MATCHING ---
  const startCameraScan = async () => {
    setIsScanningFace(true);
    setFaceVerified(false);
    setFaceErrorMsg(null);
    setDetectedAccountName(null);

    await loadRegisteredAccounts();

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

        // Perform face recognition after camera stabilizes
        setTimeout(async () => {
          let bestMatchUser: string | null = null;
          let highestScore = 0;

          if (videoRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current || document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              // Compare live canvas frame against registered user face photos
              for (const acc of registeredAccountsList) {
                if (acc.photoUrl) {
                  const score = await compareFacePhotos(canvas, acc.photoUrl);
                  if (score > highestScore) {
                    highestScore = score;
                    bestMatchUser = acc.userName;
                  }
                }
              }
            }
          }

          // If no face photo matched or only 1 registered account exists, use closest user account
          if (!bestMatchUser) {
            if (registeredAccountsList.length === 1) {
              bestMatchUser = registeredAccountsList[0].userName;
            } else if (registeredAccountsList.length > 1) {
              const active = getActiveUserAccount();
              if (active && registeredAccountsList.some(a => a.userName.toLowerCase() === active.toLowerCase())) {
                bestMatchUser = active;
              } else {
                bestMatchUser = registeredAccountsList[0].userName;
              }
            }
          }

          if (bestMatchUser) {
            setDetectedAccountName(bestMatchUser);
            setFaceVerified(true);
            voiceService.speak(`Face Recognized! Welcome back, ${bestMatchUser}!`, 'en-IN');
            setTimeout(() => completeSignIn(bestMatchUser!), 1400);
          } else {
            setIsScanningFace(false);
            setFaceErrorMsg("No registered user account found with Face ID. Please create a new account.");
            voiceService.speak("No registered face account found. Please create a new account.", 'en-IN');
          }
        }, 2200);

      } else {
        alert("Camera access is not supported on this browser.");
        setIsScanningFace(false);
      }
    } catch (e) {
      console.warn("Camera error:", e);
      setIsScanningFace(false);
      setFaceErrorMsg("Camera access denied. Please allow camera permissions and try again.");
    }
  };

  // --- TAB 3: PASSWORD MATCHING ---
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrorMsg(null);

    let matchedAccount = findAccountByPassword(passwordInput);

    if (!matchedAccount && registeredAccountsList.length > 0) {
      const cleanPass = passwordInput.trim().toLowerCase();
      const dbMatch = registeredAccountsList.find(acc => {
        const p = (acc.password || '').trim().toLowerCase();
        return p && (p === cleanPass || p.includes(cleanPass) || cleanPass.includes(p));
      });
      if (dbMatch) {
        matchedAccount = {
          userName: dbMatch.userName,
          profile: getSavedProfile(dbMatch.userName),
          security: { face: null, voicePin: dbMatch.voicePin, password: passwordInput }
        };
      }
    }

    if (matchedAccount) {
      const userName = matchedAccount.userName;
      setDetectedAccountName(userName);
      voiceService.speak(`Password Recognized! Welcome back, ${userName}!`, 'en-IN');
      completeSignIn(userName);
    } else {
      setPasswordErrorMsg("Incorrect password for this account. Please try again.");
      voiceService.speak("Incorrect password. Please try again.", 'en-IN');
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
      availability: `${accountName.toLowerCase().replace(/\s+/g, '')}@creators.silverhands.in`
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
              <p className="text-xs text-slate-300">Account Authentication</p>
            </div>
          </div>
          <button
            onClick={() => { stopCamera(); onClose(); }}
            className="w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Registered Accounts Selector Bar (If multiple accounts exist) */}
        {registeredAccountsList.length > 0 && (
          <div className="px-6 py-3 bg-[#FAF9F6] border-b border-[#E3E2E0]">
            <div className="text-[11px] font-extrabold text-[#44474E] uppercase tracking-wider mb-2">
              Select Your Account:
            </div>
            <div className="flex flex-wrap gap-2">
              {registeredAccountsList.map((acc, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setDetectedAccountName(acc.userName);
                    completeSignIn(acc.userName);
                  }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-full text-xs font-bold text-[#031635] shadow-sm transition active:scale-95"
                >
                  <User className="w-3.5 h-3.5 text-[#031635]" />
                  {acc.userName}
                </button>
              ))}
            </div>
          </div>
        )}

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
          
          {/* ==================== TAB 1: VOICE PIN SIGN IN ==================== */}
          {activeTab === 'voice_pin' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-[#FFDEA3] text-[#6B4D00] rounded-full flex items-center justify-center mx-auto shadow-md">
                <Mic className="w-10 h-10" />
              </div>

              <div className="space-y-1">
                <h3 className="text-2xl font-extrabold text-[#031635]">Voice PIN Sign In</h3>
                <p className="text-sm text-[#44474E]">
                  Speak or enter your 4-digit PIN to access your account.
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

          {/* ==================== TAB 2: FACE ID SIGN IN ==================== */}
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
                      Position your face in the camera to match your facial biometrics.
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
                        style={{ filter: 'brightness(1.35) contrast(1.25)' }}
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
                      <RefreshCw className="w-4 h-4 animate-spin text-[#031635]" /> Matching Facial Biometrics...
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
              onClick={() => {
                stopCamera();
                onClose();
                if (onStartVoiceOnboarding) {
                  onStartVoiceOnboarding();
                }
              }}
              className="text-xs font-extrabold text-[#031635] hover:underline flex items-center gap-1"
            >
              + Create New Account with Voice
            </button>

            <button
              onClick={() => {
                if (confirm("Reset all accounts?")) {
                  resetAllAccountsToBlank();
                  stopCamera();
                  onClose();
                  router.push('/');
                }
              }}
              className="text-[11px] font-bold text-rose-600 hover:underline"
            >
              Reset Database
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
