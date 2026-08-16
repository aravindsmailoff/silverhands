'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { voiceService } from '@/lib/voice';
import { 
  voiceAgent, ProfileState, AgentTurnResponse, INITIAL_PROFILE_STATE, 
  getSavedProfile, resetAllAccountsToBlank, registerFaceData, 
  registerVoicePinData, registerPasswordData, registerCompleteUserAccount, 
  setActiveUserAccount, getActiveUserAccount, isPasswordUsedByOtherUser 
} from '@/lib/voice-agent';
import { 
  CheckCircle2, RefreshCw, Volume2, Sparkles, ShieldCheck, UserCheck, 
  Mic, ArrowRight, LogOut, LogIn, UserPlus, Camera, Lock, ScanFace, AlertCircle, Check 
} from 'lucide-react';

import SignInModal from '@/components/SignInModal';
import { extractSpokenDigits } from '@/lib/semantic-extractor';

type AgentVisualState = 'IDLE' | 'AI_SPEAKING' | 'LISTENING_TO_YOU' | 'PROCESSING' | 'SECURITY_REGISTRATION' | 'COMPLETED';

export default function VoiceConversationalApp() {
  const router = useRouter();
  const [agentState, setAgentState] = useState<AgentVisualState>('IDLE');
  const [conversationState, setConversationState] = useState<string>('ASKING_NAME');
  const [currentAiQuestion, setCurrentAiQuestion] = useState<string>(
    "Welcome to SilverHands! I will help you create your profile using voice. What is your name?"
  );
  const [userTranscript, setUserTranscript] = useState<string>('');
  const [isTextEditOpen, setIsTextEditOpen] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>('');
  const [profileState, setProfileState] = useState<ProfileState>({ ...INITIAL_PROFILE_STATE });
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState<boolean>(false);
  const [confirmationMode, setConfirmationMode] = useState<boolean>(false);

  // Security Registration States (Voice-Oriented)
  const [capturedFacePhoto, setCapturedFacePhoto] = useState<string | null>(null);
  const [voicePinInput, setVoicePinInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [securityErrorMsg, setSecurityErrorMsg] = useState<string | null>(null);
  const [isFaceCaptured, setIsFaceCaptured] = useState<boolean>(false);
  const [isListeningPin, setIsListeningPin] = useState<boolean>(false);
  const [isListeningPassword, setIsListeningPassword] = useState<boolean>(false);

  const isMounted = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    isMounted.current = true;
    
    // Auto-initialize Railway PostgreSQL database schema
    fetch('/api/db/init').catch((err) => console.warn('[DB Init Warning]:', err));

    const saved = getSavedProfile();
    if (saved && saved.name && saved.name !== 'Senior Creator') {
      setProfileState(saved);
      setIsLoggedIn(true);
    } else {
      if (saved && saved.name === 'Senior Creator') {
        resetAllAccountsToBlank();
      }
      setIsLoggedIn(false);
      setProfileState({ ...INITIAL_PROFILE_STATE });
    }
    return () => {
      isMounted.current = false;
      stopCamera();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      voiceService.stopListening();
    };
  }, []);

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const startSecurityCamera = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }
    } catch (e) {
      console.warn("Camera start error:", e);
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
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedFacePhoto(dataUrl);
        setIsFaceCaptured(true);
        stopCamera();

        const userName = profileState.name?.trim() || getActiveUserAccount() || '';
        if (userName) {
          registerFaceData(dataUrl, userName);
        }

        voiceService.speak("Face ID snapshot captured successfully. Now, let's record your 4-digit voice PIN.", 'en-IN');
        setTimeout(() => {
          startListeningForVoicePin();
        }, 1200);
      }
    }
  };

  // Voice-Oriented PIN Listening
  const startListeningForVoicePin = () => {
    setIsListeningPin(true);
    setSecurityErrorMsg(null);

    voiceService.speakAndListen(
      "Please speak your 4-digit security PIN into the microphone.",
      {
        onResult: (res) => {
          if (res.transcript) {
            const digits = extractSpokenDigits(res.transcript);
            if (digits.length >= 4) {
              const pin4 = digits.slice(0, 4);
              setVoicePinInput(pin4);
              setIsListeningPin(false);
              voiceService.stopListening();

              const userName = profileState.name?.trim() || getActiveUserAccount() || '';
              if (userName) {
                registerVoicePinData(pin4, userName);
              }

              voiceService.speak(`Voice PIN recorded as ${pin4.split('').join(' ')}. Now please speak your account password.`, 'en-IN');
              setTimeout(() => {
                startListeningForPassword();
              }, 400);
            }
          }
        },
        onError: () => setIsListeningPin(false),
        onEnd: () => setIsListeningPin(false)
      }
    );
  };

  // Voice-Oriented Password Listening
  const startListeningForPassword = () => {
    setIsListeningPassword(true);
    setSecurityErrorMsg(null);

    voiceService.speakAndListen(
      "Now speak your account password into the microphone.",
      {
        onResult: (res) => {
          if (res.transcript) {
            const spokenPass = res.transcript.trim();
            setPasswordInput(spokenPass);
            setConfirmPasswordInput(spokenPass);
            setIsListeningPassword(false);
            voiceService.stopListening();

            const userName = profileState.name?.trim() || getActiveUserAccount() || '';
            if (userName) {
              registerPasswordData(spokenPass, userName);
            }

            voiceService.speak(`Password recorded as ${spokenPass}. All security credentials captured!`, 'en-IN');
          }
        },
        onError: () => setIsListeningPassword(false),
        onEnd: () => setIsListeningPassword(false)
      }
    );
  };

  // Logout action - completely resets browser storage to blank
  const handleLogout = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    voiceService.stopListening();
    stopCamera();
    resetAllAccountsToBlank();
    voiceAgent.resetState();
    setProfileState({ ...INITIAL_PROFILE_STATE });
    setConversationState('ASKING_NAME');
    setIsLoggedIn(false);
    setHasStarted(false);
    setAgentState('IDLE');
    setUserTranscript('');
    setConfirmationMode(false);
    setCapturedFacePhoto(null);
    setIsFaceCaptured(false);
    setVoicePinInput('');
    setPasswordInput('');
    setCurrentAiQuestion("Welcome to SilverHands! I will help you create your profile using voice. What is your name?");
  };

  // Start a fresh new interactive voice conversation loop on homepage
  const handleStartConversation = () => {
    voiceAgent.resetState();
    setConversationState('ASKING_NAME');
    setProfileState(voiceAgent.getProfileState());
    setHasStarted(true);
    setIsTextEditOpen(false);
    setEditText('');
    triggerAiSpeaking(currentAiQuestion);
  };

  // AI speaks question out loud, then opens mic automatically
  const triggerAiSpeaking = (textToSpeak: string) => {
    setUserTranscript('');
    setIsTextEditOpen(false);
    setEditText('');
    setAgentState('AI_SPEAKING');
    setCurrentAiQuestion(textToSpeak);

    voiceAgent.speakQuestion(textToSpeak, () => {
      if (isMounted.current) {
        startListeningToUser();
      }
    });
  };

  // Automatically start listening to user's response
  const startListeningToUser = () => {
    setAgentState('LISTENING_TO_YOU');
    setUserTranscript('');

    voiceService.startListening({
      onResult: (result) => {
        if (result.transcript) {
          setUserTranscript(result.transcript);
          setEditText(result.transcript);
        }
      },
      onError: (err) => {
        console.warn('Speech recognition error:', err);
        setAgentState('IDLE');
      },
      onEnd: () => {}
    });
  };

  const handleRespeak = () => {
    setUserTranscript('');
    voiceService.stopListening();
    setIsTextEditOpen(true);
    setEditText(userTranscript || '');
    triggerAiSpeaking("I am listening again. You can speak into the mic or type your exact spelling below.");
  };

  // Process user speech/text when user submits via voice or edit button
  const handleSendUserSpeech = async (speechTextToSend?: string) => {
    const textToProcess = (speechTextToSend !== undefined ? speechTextToSend : (editText || userTranscript)).trim();
    if (!textToProcess) return;

    const currentTurn = voiceService.getTurnId();
    console.log(`[VOICE] transcript_submitted { turn_id: ${currentTurn}, timestamp: ${Date.now()}, text: "${textToProcess}" }`);

    voiceService.stopListening();
    setUserTranscript('');
    setIsTextEditOpen(false);
    setEditText('');
    setAgentState('PROCESSING');

    try {
      const turnResponse: AgentTurnResponse = await voiceAgent.processUserSpeech(textToProcess);
      console.log(`[VOICE] profile_update { turn_id: ${currentTurn}, timestamp: ${Date.now()}, state: '${turnResponse.conversation_state}', updated_profile:`, turnResponse.updated_profile, `next_question: "${turnResponse.next_question}" }`);
      
      setProfileState(turnResponse.updated_profile);
      setConfirmationMode(turnResponse.confirmation_mode);
      setConversationState(turnResponse.conversation_state);

      if (turnResponse.completed) {
        // Transition to Voice-Oriented Security & Password Registration Step
        setAgentState('SECURITY_REGISTRATION');
        startSecurityCamera();
        voiceService.speak(`Profile details recorded for ${turnResponse.updated_profile.name || 'you'}. Now let's capture your Face ID and speak your password.`, 'en-IN');
      } else {
        triggerAiSpeaking(turnResponse.next_question);
      }
    } catch (err) {
      console.error('Error handling user turn:', err);
      setAgentState('IDLE');
    }
  };

  // Finalize Security Registration (Face ID + Voice PIN + Password)
  const handleFinalizeSecurityRegistration = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSecurityErrorMsg(null);

    const userName = profileState.name?.trim() || getActiveUserAccount() || '';
    if (!userName) {
      setSecurityErrorMsg("Please provide your name first.");
      voiceService.speak("Please provide your name first.", 'en-IN');
      return;
    }

    if (!passwordInput || passwordInput.length < 4) {
      setSecurityErrorMsg("Please speak or enter a password of at least 4 characters.");
      voiceService.speak("Please speak or enter a password of at least 4 characters.", 'en-IN');
      return;
    }

    if (isPasswordUsedByOtherUser(userName, passwordInput)) {
      const msg = "This password is used by another account. Please speak or enter a unique password.";
      setSecurityErrorMsg(msg);
      voiceService.speak(msg, 'en-IN');
      return;
    }

    // Register atomic complete user account in registry
    registerCompleteUserAccount({
      userName,
      profile: profileState,
      voicePin: voicePinInput || null,
      password: passwordInput || null,
      photoUrl: capturedFacePhoto || null
    });

    setIsLoggedIn(true);
    setAgentState('COMPLETED');

    voiceService.speak(`Congratulations ${userName}! Your profile, Face ID, and voice password have been registered successfully. Loading your dashboard now.`, 'en-IN');
    setTimeout(() => {
      router.push('/dashboard');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] flex flex-col antialiased">
      <canvas ref={canvasRef} className="hidden" />

      {/* Facial Recognition / Password Sign In Modal */}
      <SignInModal
        isOpen={isSignInModalOpen}
        onClose={() => setIsSignInModalOpen(false)}
        onSuccess={(name) => {
          setIsLoggedIn(true);
          const saved = getSavedProfile();
          setProfileState(saved);
        }}
        onStartVoiceOnboarding={() => {
          setIsSignInModalOpen(false);
          handleStartConversation();
        }}
      />

      {/* Top Desktop Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                🤝
              </div>
              <div>
                <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
                <span className="text-xs font-semibold text-[#44474E] tracking-widest uppercase block -mt-1">Senior Livelihood</span>
              </div>
            </Link>

            {/* Always Visible Navigation Bar */}
            <nav className="hidden md:flex items-center gap-1 bg-[#F4F3F1] p-1.5 rounded-full border border-[#E3E2E0]">
              <Link href="/" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Home
              </Link>
              <Link href="/provider" className="px-5 py-2 rounded-full bg-[#031635] text-[#FDBC13] font-bold text-sm shadow-sm">
                Provider Voice Agent
              </Link>
              <Link href="/consumer/dashboard" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Consumer Marketplace
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-block text-sm font-extrabold text-[#031635] bg-[#D8E2FF] px-4 py-2 rounded-full border border-[#031635]/20">
                  👤 Signed in as {profileState.name || 'Member'}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold rounded-2xl shadow-md transition active:scale-95"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSignInModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] text-sm font-extrabold rounded-2xl transition active:scale-95 border border-[#E3E2E0]"
                >
                  <LogIn className="w-4 h-4" /> Sign In
                </button>
                <button
                  onClick={handleStartConversation}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#FDBC13] hover:bg-[#F3B20B] text-[#261900] text-sm font-extrabold rounded-2xl shadow-md transition active:scale-95"
                >
                  <UserPlus className="w-4 h-4" /> Create Account with Voice
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Conversational Canvas */}
      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-6 lg:px-12 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (7 Cols): Ambient Voice Interaction Hub */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center space-y-8 bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 md:p-10 shadow-md relative min-h-[540px]">

          {!hasStarted ? (
            /* Welcome Launcher Screen */
            <div className="text-center space-y-6 my-auto w-full max-w-lg">
              <div className="w-20 h-20 bg-[#031635] text-white rounded-full flex items-center justify-center mx-auto shadow-xl">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                  handshake
                </span>
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl md:text-3xl font-extrabold text-[#031635] leading-tight">
                  Service Provider Portal
                </h1>
                <p className="text-sm text-[#44474E] leading-relaxed">
                  Voice-driven livelihood platform for senior masters and artisans. Create your verified profile with voice, facial photo scan, or PIN.
                </p>
              </div>

              <div className="space-y-4">
                {/* Button 1: Create Account with Voice */}
                <button
                  onClick={handleStartConversation}
                  className="group relative w-full h-[76px] bg-[#031635] text-white rounded-2xl flex items-center justify-center gap-4 shadow-xl hover:bg-[#1a2b4b] active:scale-95 transition-all"
                >
                  <div className="absolute inset-0 rounded-2xl ring-4 ring-[#FDBC13] ring-offset-2 ring-offset-white animate-pulse opacity-70 pointer-events-none" />
                  <span className="material-symbols-outlined text-4xl text-[#FDBC13]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    mic
                  </span>
                  <span className="text-xl font-bold">Start Jarvis Voice Profile Maker</span>
                </button>

                {/* Button 2: Sign In with Facial Scan / Voice */}
                <button
                  onClick={() => setIsSignInModalOpen(true)}
                  className="w-full py-4 bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] text-lg font-bold rounded-2xl flex items-center justify-center gap-3 border-2 border-[#E3E2E0] transition active:scale-95 shadow-sm"
                >
                  <LogIn className="w-5 h-5 text-[#031635]" />
                  <span>Sign In (Facial Scan / Voice / PIN)</span>
                </button>
              </div>
            </div>
          ) : agentState === 'SECURITY_REGISTRATION' ? (
            /* STEP 2 OF PROFILE CREATION: 100% VOICE-ORIENTED SECURITY SETUP */
            <form onSubmit={handleFinalizeSecurityRegistration} className="w-full space-y-6 text-center">
              <div className="space-y-2">
                <div className="w-16 h-16 bg-[#031635] text-[#FDBC13] rounded-full flex items-center justify-center mx-auto shadow-md">
                  <ScanFace className="w-8 h-8" />
                </div>
                <h2 className="text-3xl font-black text-[#031635]">Voice Security Setup</h2>
                <p className="text-sm text-[#44474E]">
                  Register Face ID & spoken security credentials for <strong className="text-[#031635]">{profileState.name || 'New Creator'}</strong>.
                </p>
              </div>

              {securityErrorMsg && (
                <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl text-rose-800 text-xs font-bold flex items-center justify-center gap-2 animate-pulse">
                  <AlertCircle className="w-5 h-5 text-rose-600" /> {securityErrorMsg}
                </div>
              )}

              {/* Camera Face Capture Frame */}
              <div className="relative w-56 h-56 rounded-full overflow-hidden border-4 border-[#FDBC13] shadow-2xl bg-black mx-auto flex items-center justify-center">
                {!isFaceCaptured ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover transform -scale-x-100" />
                    <div className="absolute inset-0 border-4 border-dashed border-[#FDBC13] rounded-full animate-spin opacity-80" style={{ animationDuration: '6s' }} />
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capturedFacePhoto || ''} alt="Captured Face" className="w-full h-full object-cover" />
                )}
              </div>

              {!isFaceCaptured ? (
                <button
                  type="button"
                  onClick={captureFaceSnapshot}
                  className="w-full py-3.5 bg-[#2D5A27] text-white text-base font-bold rounded-2xl shadow hover:bg-[#20421c] flex items-center justify-center gap-2 transition"
                >
                  <Camera className="w-5 h-5" /> 📸 Capture & Register Face ID
                </button>
              ) : (
                <div className="p-3 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-extrabold rounded-2xl flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" /> Face ID Registered!
                </div>
              )}

              {/* 100% Voice-Oriented PIN & Password Spoken Setup */}
              <div className="space-y-4 text-left pt-2">
                {/* Voice PIN Button & Input */}
                <div className="p-4 bg-[#F4F3F1] border-2 border-[#E3E2E0] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-[#031635]">4-Digit Voice PIN (Spoken)</label>
                    <button
                      type="button"
                      onClick={startListeningForVoicePin}
                      className={`px-3 py-1.5 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 shadow-sm ${
                        isListeningPin ? 'bg-rose-600 text-white animate-pulse' : 'bg-[#FDBC13] text-[#261900] hover:bg-[#F3B20B]'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" /> {isListeningPin ? 'Listening for PIN...' : '🎙️ Speak Voice PIN'}
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={4}
                    value={voicePinInput}
                    onChange={(e) => setVoicePinInput(e.target.value)}
                    placeholder="Spoken PIN will appear here (e.g. 4242)"
                    className="w-full px-4 py-2.5 bg-white border border-[#E3E2E0] rounded-xl text-base font-extrabold text-[#031635] outline-none"
                  />
                </div>

                {/* Spoken Password Button & Input */}
                <div className="p-4 bg-[#F4F3F1] border-2 border-[#E3E2E0] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold text-[#031635]">Account Password (Spoken)</label>
                    <button
                      type="button"
                      onClick={startListeningForPassword}
                      className={`px-3 py-1.5 text-xs font-extrabold rounded-xl transition flex items-center gap-1.5 shadow-sm ${
                        isListeningPassword ? 'bg-rose-600 text-white animate-pulse' : 'bg-[#031635] text-white hover:bg-[#1a2b4b]'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5 text-[#FDBC13]" /> {isListeningPassword ? 'Listening for Password...' : '🎙️ Speak Password Aloud'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setConfirmPasswordInput(e.target.value);
                    }}
                    placeholder="Spoken password will appear here"
                    className="w-full px-4 py-2.5 bg-white border border-[#E3E2E0] rounded-xl text-base font-extrabold text-[#031635] outline-none"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-xl hover:bg-[#1a2b4b] flex items-center justify-center gap-2 transition"
              >
                <CheckCircle2 className="w-6 h-6 text-[#FDBC13]" /> Complete Account & Open Dashboard
              </button>
            </form>
          ) : agentState === 'COMPLETED' ? (
            /* Account & Profile Created Celebration State */
            <div className="text-center space-y-6 my-auto w-full max-w-md">
              <div className="w-20 h-20 bg-[#2D5A27] text-white rounded-full flex items-center justify-center mx-auto shadow-xl">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div className="space-y-2">
                <h2 className="text-3xl font-extrabold text-[#031635]">
                  Profile & Biometrics Registered!
                </h2>
                <p className="text-base text-[#44474E]">
                  Welcome aboard, <span className="font-bold text-[#031635]">{profileState.name || 'Member'}</span>! Your Face ID and voice password are saved.
                </p>
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <Link
                  href="/dashboard"
                  className="w-full py-4 bg-[#FDBC13] text-[#261900] text-lg font-bold rounded-2xl shadow-md flex items-center justify-center gap-2 hover:bg-[#F3B20B]"
                >
                  Open Sahayak Dashboard <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  href="/profile"
                  className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2 hover:bg-[#1a2b4b]"
                >
                  View My Profile
                </Link>
              </div>
            </div>
          ) : (
            /* Active Voice Loop Engine */
            <div className="w-full flex flex-col items-center space-y-8 my-auto">

              {/* Status Header Badge */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold uppercase tracking-wider shadow-sm border">
                {agentState === 'AI_SPEAKING' && (
                  <span className="bg-[#D8E2FF] text-[#031635] border-[#031635]/30 flex items-center gap-2 px-3 py-1 rounded-full">
                    <Volume2 className="w-4 h-4 animate-bounce text-[#031635]" /> 🔊 AI Assistant Speaking...
                  </span>
                )}
                {agentState === 'LISTENING_TO_YOU' && (
                  <span className="bg-[#FFDEA3] text-[#6B4D00] border-[#FDBC13] flex items-center gap-2 px-3 py-1 rounded-full animate-pulse">
                    <span className="w-3 h-3 bg-rose-600 rounded-full animate-ping" /> 🔴 Listening to You... Speak Now
                  </span>
                )}
                {agentState === 'PROCESSING' && (
                  <span className="bg-[#E9E8E5] text-[#031635] flex items-center gap-2 px-3 py-1 rounded-full">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#031635]" /> AI Processing Voice Answer...
                  </span>
                )}
                {agentState === 'IDLE' && (
                  <span className="bg-[#EFEEEB] text-[#44474E] flex items-center gap-2 px-3 py-1 rounded-full">
                    Tap Mic to Speak
                  </span>
                )}
              </div>

              {/* Central Pulsing Microphone Visualizer */}
              <div className="relative w-48 h-48 flex items-center justify-center">
                {agentState === 'LISTENING_TO_YOU' && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-[#FDBC13] opacity-30 pulse-ring" />
                    <div className="absolute inset-4 rounded-full bg-[#FDBC13] opacity-50 pulse-ring" style={{ animationDelay: '0.5s' }} />
                  </>
                )}
                {agentState === 'AI_SPEAKING' && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-[#031635] opacity-20 pulse-ring" />
                    <div className="absolute inset-4 rounded-full bg-[#031635] opacity-40 pulse-ring" style={{ animationDelay: '0.4s' }} />
                  </>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (agentState === 'LISTENING_TO_YOU') {
                      handleSendUserSpeech();
                    } else {
                      startListeningToUser();
                    }
                  }}
                  className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center shadow-2xl transition-all ${
                    agentState === 'LISTENING_TO_YOU'
                      ? 'bg-rose-600 text-white border-4 border-rose-300 scale-105'
                      : agentState === 'AI_SPEAKING'
                      ? 'bg-[#031635] text-[#FDBC13] border-4 border-[#1a2b4b]'
                      : 'bg-[#031635] text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-6xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    mic
                  </span>
                </button>
              </div>

              {/* AI Spoken Question Box */}
              <div className="w-full bg-[#F4F3F1] border-2 border-[#E3E2E0] rounded-2xl p-6 text-center space-y-2 shadow-inner">
                <span className="text-xs uppercase font-extrabold text-[#44474E] tracking-widest flex items-center justify-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#FDBC13]" /> AI Assistant Question
                </span>
                <p className="text-xl md:text-2xl font-bold text-[#031635] leading-snug">
                  &quot;{currentAiQuestion}&quot;
                </p>
              </div>

              {/* User Live Spoken Transcript Card */}
              <div className="w-full bg-white border-2 border-[#C5C6CF] rounded-2xl p-5 text-center space-y-3 shadow-md">
                <span className="text-xs uppercase font-extrabold text-[#44474E] tracking-wider">
                  You Spoke:
                </span>
                <p className="text-lg md:text-xl font-semibold italic text-[#1A1C1A]">
                  {userTranscript ? `"${userTranscript}"` : (agentState === 'LISTENING_TO_YOU' ? 'Listening for your spoken words...' : 'Waiting for audio...')}
                </p>

                {/* Conditional Inline Typing / Spelling Drawer on Re-speak / Correction */}
                {isTextEditOpen && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendUserSpeech(editText);
                    }}
                    className="w-full bg-[#FAF9F6] border-2 border-[#031635] rounded-2xl p-3 space-y-2 text-left"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[#031635]">
                      <span>✏️ Type or Fix Spelling (e.g. Harrish, Badminton):</span>
                      <button
                        type="button"
                        onClick={() => setIsTextEditOpen(false)}
                        className="text-[#44474E] hover:underline text-[11px]"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Type exact spelling..."
                        className="flex-1 px-3 py-2 bg-white border border-[#C5C6CF] rounded-xl text-sm font-bold text-[#031635] outline-none"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#031635] text-white text-xs font-bold rounded-xl shadow hover:bg-[#1a2b4b]"
                      >
                        Save & Send
                      </button>
                    </div>
                  </form>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  {agentState === 'LISTENING_TO_YOU' && (
                    <button
                      onClick={() => handleSendUserSpeech()}
                      className="px-6 py-2.5 bg-[#2D5A27] text-white text-sm font-extrabold rounded-xl shadow-md hover:bg-[#20421c] transition flex items-center gap-2 animate-pulse"
                    >
                      <Check className="w-4 h-4" /> Done Speaking (Submit Answer)
                    </button>
                  )}

                  <button
                    onClick={handleRespeak}
                    className="px-4 py-2 bg-[#FDBC13] text-[#261900] text-xs font-extrabold rounded-xl shadow hover:bg-[#F3B20B] transition flex items-center gap-1.5"
                  >
                    <Mic className="w-4 h-4" /> Re-speak / Correct Answer
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Right Column (5 Cols): Real-time Structured Profile State Card */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-md space-y-5">
            <div className="flex items-center justify-between border-b-2 border-[#E3E2E0] pb-3">
              <h3 className="text-xl font-extrabold text-[#031635] flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-[#2D5A27]" /> Live Profile State
              </h3>
              <span className="text-xs font-bold text-[#2D5A27] bg-[#2D5A27]/10 px-3 py-1 rounded-full border border-[#2D5A27]/30">
                JARVIS AI CONVERSATION
              </span>
            </div>

            <div className="space-y-3 text-sm">
              {/* Field 1: Name */}
              <div className={`p-3.5 rounded-2xl border transition-all ${profileState.name ? 'bg-[#2D5A27]/10 border-[#2D5A27]/30' : 'bg-[#F4F3F1] border-[#E3E2E0]'}`}>
                <div className="flex items-center justify-between text-xs font-semibold text-[#44474E]">
                  <span>Full Name</span>
                  {profileState.name && (
                    <button
                      onClick={() => {
                        setProfileState(prev => ({ ...prev, name: null }));
                        triggerAiSpeaking("What is your correct full name?");
                      }}
                      className="text-[11px] font-extrabold text-[#031635] hover:underline flex items-center gap-1"
                    >
                      ✏️ Fix Name
                    </button>
                  )}
                </div>
                <div className="text-base font-extrabold text-[#031635] flex items-center justify-between mt-0.5">
                  <span>{profileState.name || 'Not collected yet...'}</span>
                  {profileState.name && <CheckCircle2 className="w-5 h-5 text-[#2D5A27]" />}
                </div>
              </div>

              {/* Field 2 & 3: Multi-Skills & Per-Skill Experience */}
              <div className={`p-3.5 rounded-2xl border transition-all ${profileState.skills && profileState.skills.length > 0 ? 'bg-[#2D5A27]/10 border-[#2D5A27]/30' : 'bg-[#F4F3F1] border-[#E3E2E0]'}`}>
                <div className="flex items-center justify-between text-xs font-semibold text-[#44474E] mb-1">
                  <span>Skills, Crafts & Experience</span>
                  {profileState.skills && profileState.skills.length > 0 && (
                    <button
                      onClick={() => {
                        setProfileState(prev => ({ ...prev, skills: [], skill: null, experience_years: null }));
                        triggerAiSpeaking("What skills or crafts would you like to offer?");
                      }}
                      className="text-[11px] font-extrabold text-[#031635] hover:underline flex items-center gap-1"
                    >
                      ✏️ Fix Skills
                    </button>
                  )}
                </div>

                {profileState.skills && profileState.skills.length > 0 ? (
                  <div className="space-y-2 mt-1.5">
                    {profileState.skills.map((s, idx) => (
                      <div
                        key={idx}
                        className="bg-white/80 border border-[#C5C6CF] rounded-xl p-2.5 flex items-center justify-between shadow-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#2D5A27]" />
                          <div>
                            <div className="text-sm font-extrabold text-[#031635] flex items-center gap-1.5">
                              <span>{s.name}</span>
                              {s.type === 'primary' && (
                                <span className="text-[9px] uppercase font-black bg-[#FDBC13] text-[#261900] px-1.5 py-0.5 rounded-md">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-semibold text-[#44474E]">
                              {s.experience_years !== null
                                ? (s.experience_years === 0 ? 'Starting out (0 years)' : `${s.experience_years} Years Experience`)
                                : 'Experience pending...'}
                            </div>
                          </div>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-[#2D5A27] shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-base font-extrabold text-[#031635] flex items-center justify-between mt-0.5">
                    <span>{profileState.skill || 'Not collected yet...'}</span>
                  </div>
                )}
              </div>

              {/* Field 4: Location */}
              <div className={`p-3.5 rounded-2xl border transition-all ${profileState.location ? 'bg-[#2D5A27]/10 border-[#2D5A27]/30' : 'bg-[#F4F3F1] border-[#E3E2E0]'}`}>
                <div className="flex items-center justify-between text-xs font-semibold text-[#44474E]">
                  <span>Location / City</span>
                  {profileState.location && (
                    <button
                      onClick={() => {
                        setProfileState(prev => ({ ...prev, location: null }));
                        triggerAiSpeaking("Which city or locality are you located in?");
                      }}
                      className="text-[11px] font-extrabold text-[#031635] hover:underline flex items-center gap-1"
                    >
                      ✏️ Fix Location
                    </button>
                  )}
                </div>
                <div className="text-base font-extrabold text-[#031635] flex items-center justify-between mt-0.5">
                  <span>{profileState.location || 'Not collected yet...'}</span>
                  {profileState.location && <CheckCircle2 className="w-5 h-5 text-[#2D5A27]" />}
                </div>
              </div>

              {/* Field 5: Services (Safe string/object render) */}
              <div className="p-3.5 rounded-2xl bg-[#F4F3F1] border border-[#E3E2E0]">
                <div className="text-xs font-semibold text-[#44474E] mb-1.5">Confirmed Service Offerings</div>
                <div className="flex flex-wrap gap-1.5">
                  {profileState.services.length > 0 ? (
                    profileState.services.map((srv: any, idx) => {
                      const label = typeof srv === 'string' ? srv : (srv?.name || `Service #${idx + 1}`);
                      return (
                        <span key={idx} className="bg-white border border-[#C5C6CF] text-[#031635] text-xs font-bold px-2.5 py-1 rounded-lg">
                          {label}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-xs text-[#75777F] italic">Not provided yet</span>
                  )}
                </div>
              </div>

              {/* Voice Pipeline Diagnostic Panel */}
              <div className="mt-4 p-4 bg-[#0F172A] text-white rounded-2xl text-xs font-mono space-y-2 border border-slate-700 shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                  <span className="font-bold text-[#FDBC13] tracking-wide flex items-center gap-1.5">
                    ⚙️ VOICE PIPELINE DIAGNOSTICS
                  </span>
                  <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px] text-emerald-400 font-bold">
                    TURN #{voiceService.getTurnId()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 text-[10px] block uppercase">Conversation</span>
                    <span className="font-bold text-sky-400 text-[11px] truncate block">{conversationState}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block uppercase">Agent / Mic</span>
                    <span className={`font-bold text-[11px] ${agentState === 'LISTENING_TO_YOU' ? 'text-emerald-400 animate-pulse' : 'text-amber-300'}`}>
                      {agentState === 'LISTENING_TO_YOU' ? '🔴 LISTENING' : agentState}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Last User Transcript</span>
                  <span className="text-sky-300 italic block truncate">&quot;{userTranscript || '(waiting for speech...)'}&quot;</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Last Assistant Question</span>
                  <span className="text-emerald-300 italic block truncate">&quot;{currentAiQuestion || '(none)'}&quot;</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Extracted Profile State</span>
                  <pre className="text-[10px] bg-slate-950 p-2 rounded text-slate-300 overflow-x-auto mt-1 border border-slate-800">
                    {JSON.stringify({
                      name: profileState.name,
                      skills: profileState.skills,
                      location: profileState.location
                    }, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
