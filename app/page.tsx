'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Sparkles, Mic, Video, ShoppingBag, ShieldCheck, 
  UserCheck, ArrowRight, Heart, Star, Award, BookOpen, CheckCircle2, Users, Handshake 
} from 'lucide-react';

<<<<<<< HEAD
export default function NewLandingPage() {
=======
import SignInModal from '@/components/SignInModal';
import { extractSpokenDigits } from '@/lib/semantic-extractor';

type AgentVisualState = 'IDLE' | 'AI_SPEAKING' | 'LISTENING_TO_YOU' | 'PROCESSING' | 'SECURITY_REGISTRATION' | 'COMPLETED';

export default function VoiceConversationalApp() {
  const router = useRouter();
  const [agentState, setAgentState] = useState<AgentVisualState>('IDLE');
  const [conversationState, setConversationState] = useState<ConversationState>('ASKING_NAME');
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

    const activeName = getActiveUserAccount();
    const saved = getSavedProfile(activeName || undefined);
    if (saved && saved.name && saved.name !== 'Senior Creator') {
      setProfileState(saved);
      setIsLoggedIn(true);

      // Sync confirmed profile data from PostgreSQL
      fetch('/api/users/sync')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.accounts && data.accounts.length > 0) {
            const userAcc = data.accounts.find((a: any) => 
              (a.user_name || '').toLowerCase() === (saved.name || '').toLowerCase()
            );
            if (userAcc) {
              setProfileState(prev => ({
                ...prev,
                name: userAcc.user_name || prev.name,
                skill: userAcc.skill !== null && userAcc.skill !== undefined ? userAcc.skill : prev.skill,
                experience_years: userAcc.experience_years !== null && userAcc.experience_years !== undefined ? Number(userAcc.experience_years) : prev.experience_years,
                location: userAcc.location !== null && userAcc.location !== undefined ? userAcc.location : prev.location,
                language: userAcc.language || prev.language,
                services: (userAcc.services && userAcc.services !== '[]') 
                  ? (typeof userAcc.services === 'string' ? JSON.parse(userAcc.services) : userAcc.services) 
                  : prev.services
              }));
            }
          }
        })
        .catch(err => console.warn('[PostgreSQL Sync Warning]:', err));

      // Automatically route logged in user to dashboard
      router.push('/dashboard');
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
  }, [router]);

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
        ctx.filter = 'brightness(1.25) contrast(1.2)';
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedFacePhoto(dataUrl);
        setIsFaceCaptured(true);
        stopCamera();

        const userName = profileState.name?.trim() || getActiveUserAccount() || '';
        if (userName) {
          registerFaceData(userName, dataUrl);
        }

        voiceService.speak("Face ID captured! Now let's set your voice PIN and password.", 'en-IN', () => {
          startListeningForVoicePin();
        });
      }
    }
  };

  // Voice-Oriented Voice PIN Listening (Handles spoken words and digits smoothly)
  const startListeningForVoicePin = () => {
    setIsListeningPin(true);
    setSecurityErrorMsg(null);

    voiceService.speakAndListen(
      "Speak your 4-digit Voice PIN into the microphone.",
      {
        onResult: (res) => {
          if (res.transcript) {
            const digits = extractSpokenDigits(res.transcript, 4) || res.transcript.replace(/\D/g, '').slice(0, 4);
            if (digits.length > 0) {
              setVoicePinInput(digits);
            }
            if (digits.length >= 4) {
              const finalPin = digits.slice(0, 4);
              setVoicePinInput(finalPin);
              setIsListeningPin(false);
              voiceService.stopListening();

              const userName = profileState.name?.trim() || getActiveUserAccount() || '';
              if (userName) {
                registerVoicePinData(finalPin, userName);
              }

              // Proceed to spoken password
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
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col antialiased">
      {/* Sticky Desktop Navigation Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black text-2xl shadow-md group-hover:scale-105 transition-transform">
              🤝
            </div>
            <div>
              <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
              <span className="text-xs font-bold text-[#FDBC13] tracking-widest uppercase block -mt-1 bg-[#031635] px-2 py-0.5 rounded-full text-center">
                Senior Livelihood Platform
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-extrabold text-[#44474E]">
            <a href="#about" className="hover:text-[#031635] transition">About Platform</a>
            <a href="#roles" className="hover:text-[#031635] transition">Portals</a>
            <a href="#how-it-works" className="hover:text-[#031635] transition">How It Works</a>
            <a href="#impact" className="hover:text-[#031635] transition">Impact</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/provider"
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] text-xs font-extrabold rounded-2xl border border-[#E3E2E0] transition"
            >
              👴🏽 Service Provider Portal
            </Link>

            <Link
              href="/consumer/login"
              className="flex items-center gap-2 px-5 py-2.5 bg-[#FDBC13] hover:bg-[#e0a50b] text-[#031635] text-xs font-extrabold rounded-2xl shadow-md transition"
            >
              🛒 Consumer Portal <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24 bg-gradient-to-b from-white to-[#FAF9F6] border-b border-[#E3E2E0]">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 text-center relative z-10">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#031635] text-[#FDBC13] font-black text-xs uppercase tracking-widest mb-6 shadow-sm border border-[#FDBC13]/30">
            <Sparkles className="w-4 h-4 text-[#FDBC13]" /> India's First Voice-Powered Senior Livelihood Ecosystem
          </span>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-[#031635] tracking-tight max-w-4xl mx-auto leading-none mb-6">
            Monetize Lifelong Skills & Connect Senior Masters with Next-Gen Learners
          </h1>

          <p className="text-base md:text-xl text-[#44474E] max-w-3xl mx-auto font-medium leading-relaxed mb-10">
            Empowering Indian senior citizens to earn with dignity. Service providers offer 1-on-1 live masterclasses & authentic handmade creations while consumers buy directly and learn timeless wisdom.
          </p>

          {/* DUAL ROLE SELECTION CARDS SECTION */}
          <div id="roles" className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
            {/* ROLE 1: SERVICE PROVIDER */}
            <div className="bg-white rounded-3xl p-8 border-2 border-[#031635] shadow-xl hover:shadow-2xl transition flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#031635]/5 rounded-bl-full pointer-events-none" />
              <div>
                <div className="w-14 h-14 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center text-3xl font-black mb-6 shadow-md">
                  👴🏽
                </div>

                <span className="text-xs font-black text-[#FDBC13] uppercase tracking-widest bg-[#031635] px-3 py-1 rounded-full inline-block mb-3">
                  Option 1: Service Provider
                </span>

                <h2 className="text-2xl font-black text-[#031635] tracking-tight mb-3">
                  Service Provider Portal
                </h2>

                <p className="text-sm font-semibold text-[#44474E] leading-relaxed mb-6">
                  Create your profile effortlessly using <strong>Voice Speech AI</strong> (no typing required). Register Face ID security, host 1-on-1 live classes, sell handmade crafts/recipes, and get direct payouts.
                </p>
              </div>

              <Link
                href="/provider"
                className="w-full py-4 bg-[#031635] hover:bg-[#062454] text-white font-extrabold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 group-hover:scale-[1.02]"
              >
                Enter Service Provider Portal <ArrowRight className="w-4 h-4 text-[#FDBC13]" />
              </Link>
            </div>

            {/* ROLE 2: SERVICE CONSUMER (LEARNER & BUYER) */}
            <div className="bg-white rounded-3xl p-8 border-2 border-[#FDBC13] shadow-xl hover:shadow-2xl transition flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FDBC13]/10 rounded-bl-full pointer-events-none" />
              <div>
                <div className="w-14 h-14 bg-[#FDBC13] text-[#031635] rounded-2xl flex items-center justify-center text-3xl font-black mb-6 shadow-md">
                  🛒
                </div>

                <span className="text-xs font-black text-[#031635] uppercase tracking-widest bg-[#FDBC13] px-3 py-1 rounded-full inline-block mb-3">
                  Option 2: Service Consumer
                </span>

                <h2 className="text-2xl font-black text-[#031635] tracking-tight mb-3">
                  Consumer Portal
                </h2>

                <p className="text-sm font-semibold text-[#44474E] leading-relaxed mb-6">
                  Log in or register to buy authentic handmade terracotta pottery, Tanjore paintings, and homemade pickles. Book <strong>1-on-1 live appointments</strong> and use our <strong>Ollama AI Matchmaker</strong>.
                </p>
              </div>

<<<<<<< HEAD
              <Link
                href="/consumer/login"
                className="w-full py-4 bg-[#FDBC13] hover:bg-[#e0a50b] text-[#031635] font-extrabold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 group-hover:scale-[1.02]"
              >
                Enter Consumer Portal <ArrowRight className="w-4 h-4" />
              </Link>
=======
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
                        className="text-[#75777F] hover:text-rose-600 font-normal"
                      >
                        ✕ Close
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Type exact spelling here..."
                        autoFocus
                        className="flex-1 px-3 py-2 bg-white border border-[#C5C6CF] rounded-xl text-base font-semibold text-[#031635] outline-none focus:border-[#031635]"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#031635] text-[#FDBC13] text-sm font-bold rounded-xl hover:bg-[#1a2b4b] transition shadow"
                      >
                        Submit ➔
                      </button>
                    </div>
                  </form>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                  {agentState === 'LISTENING_TO_YOU' && (
                    <button
                      onClick={() => {
                        voiceService.stopListening();
                        handleSendUserSpeech();
                      }}
                      className="px-6 py-2.5 bg-[#2D5A27] text-white text-sm font-bold rounded-xl shadow-lg hover:bg-[#20421c] transition flex items-center gap-2 animate-bounce"
                    >
                      <Check className="w-4 h-4" /> Done Speaking (Submit Answer) ➔
                    </button>
                  )}

                  {userTranscript && agentState !== 'LISTENING_TO_YOU' && (
                    <button
                      onClick={() => handleSendUserSpeech()}
                      className="px-6 py-2.5 bg-[#031635] text-white text-sm font-bold rounded-xl shadow-md hover:bg-[#1a2b4b] transition flex items-center gap-2"
                    >
                      Submit Spoken Answer &amp; Next Question ➔
                    </button>
                  )}

                  <button
                    onClick={handleRespeak}
                    className="px-4 py-2 bg-[#FDBC13] text-[#261900] text-xs font-extrabold rounded-xl shadow hover:bg-[#F3B20B] transition flex items-center gap-1.5"
                  >
                    <Mic className="w-4 h-4" /> Re-speak / Correct Answer
                  </button>

                  {!isTextEditOpen && (
                    <button
                      onClick={() => {
                        setIsTextEditOpen(true);
                        setEditText(userTranscript || '');
                      }}
                      className="px-3 py-2 bg-[#F4F3F1] border border-[#C5C6CF] text-[#031635] text-xs font-bold rounded-xl hover:bg-[#E3E2E0] transition"
                    >
                      ✏️ Type Spelling
                    </button>
                  )}
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
                <UserCheck className="w-5 h-5 text-[#2D5A27]" /> {isLoggedIn ? 'Active Member Profile' : 'Live Profile State'}
              </h3>
              <span className="text-xs font-bold text-[#2D5A27] bg-[#2D5A27]/10 px-3 py-1 rounded-full border border-[#2D5A27]/30">
                {isLoggedIn ? 'DATABASE CONFIRMED' : 'REAL-TIME OLLAMA / AI'}
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

              {/* Field 2 & 3: Skills & Experience List */}
              <div className={`p-3.5 rounded-2xl border transition-all ${profileState.skills && profileState.skills.length > 0 ? 'bg-[#2D5A27]/10 border-[#2D5A27]/30' : 'bg-[#F4F3F1] border-[#E3E2E0]'}`}>
                <div className="flex items-center justify-between text-xs font-semibold text-[#44474E] mb-1">
                  <span>Skills, Crafts &amp; Experience</span>
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

              {/* Temporary Voice Pipeline Diagnostic Panel (Part 11) */}
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
                  <span className="text-sky-300 italic block truncate">"{userTranscript || '(waiting for speech...)'}"</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Last Assistant Question</span>
                  <span className="text-emerald-300 italic block truncate">"{currentAiQuestion || '(none)'}"</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block uppercase">Extracted Profile State</span>
                  <pre className="text-[10px] bg-slate-950 p-2 rounded text-slate-300 overflow-x-auto mt-1 border border-slate-800">
                    {JSON.stringify({
                      name: profileState.name,
                      skill: profileState.skill,
                      experience_years: profileState.experience_years,
                      location: profileState.location
                    }, null, 2)}
                  </pre>
                </div>
              </div>

>>>>>>> 100b7db (fix: resolve React object child error, fix mic recognition for PIN/password, add continuous speech capture and Done Speaking button)
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT SCREEN SECTION */}
      <section id="about" className="py-20 bg-white border-b border-[#E3E2E0]">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="px-4 py-1.5 rounded-full bg-[#F4F3F1] text-[#031635] font-black text-xs uppercase tracking-widest border border-[#E3E2E0] inline-block mb-4">
              About SilverHands
            </span>
            <h2 className="text-3xl md:text-5xl font-black text-[#031635] tracking-tight">
              Transforming Senior Wisdom into Active Livelihood
            </h2>
            <p className="mt-4 text-base md:text-lg text-[#44474E] font-medium leading-relaxed">
              India is home to over 140 million senior citizens. Many possess unparalleled expertise in traditional crafts, culinary heritage, fine arts, and gardening—yet lack accessible digital tools. SilverHands bridges this gap.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[#FAF9F6] p-8 rounded-3xl border border-[#E3E2E0] space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#031635] text-[#FDBC13] flex items-center justify-center text-xl font-bold">
                <Mic className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-[#031635]">Voice AI Accessibility</h3>
              <p className="text-sm font-semibold text-[#44474E] leading-relaxed">
                Service providers create their profile, specify skills, and describe products simply by speaking in their native Indian language. Zero typing required.
              </p>
            </div>

            <div className="bg-[#FAF9F6] p-8 rounded-3xl border border-[#E3E2E0] space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#031635] text-[#FDBC13] flex items-center justify-center text-xl font-bold">
                <Video className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-[#031635]">1-on-1 Live Masterclasses</h3>
              <p className="text-sm font-semibold text-[#44474E] leading-relaxed">
                Consumers can book direct 1-on-1 live video appointments with master potters, Tanjore painters, and heritage chefs for personalized guidance.
              </p>
            </div>

            <div className="bg-[#FAF9F6] p-8 rounded-3xl border border-[#E3E2E0] space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#031635] text-[#FDBC13] flex items-center justify-center text-xl font-bold">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-[#031635]">Ollama AI Need Matchmaker</h3>
              <p className="text-sm font-semibold text-[#44474E] leading-relaxed">
                Consumers type any prompt (e.g., "biryani recipe video", "pottery"), and our local Ollama AI segregates matching videos, 1-on-1 sessions, and products instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-20 bg-[#FAF9F6] border-b border-[#E3E2E0]">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-[#031635] tracking-tight">
              How SilverHands Works
            </h2>
            <p className="mt-4 text-base text-[#44474E] font-semibold">
              Designed for extreme simplicity for service providers, and seamless discovery for consumers.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* For Service Providers */}
            <div className="bg-white p-8 lg:p-10 rounded-3xl border border-[#E3E2E0] shadow-md space-y-6">
              <div className="flex items-center gap-3 border-b border-[#E3E2E0] pb-4">
                <span className="text-3xl">👴🏽</span>
                <div>
                  <h3 className="text-xl font-black text-[#031635]">For Service Providers</h3>
                  <span className="text-xs font-bold text-[#44474E]">3 Simple Steps</span>
                </div>
              </div>

              <div className="space-y-4 text-sm font-semibold text-[#44474E]">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#031635] text-white flex items-center justify-center font-black text-xs shrink-0">1</span>
                  <p><strong className="text-[#031635]">Speak to Create Profile:</strong> Answer simple questions spoken by our AI voice assistant.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#031635] text-white flex items-center justify-center font-black text-xs shrink-0">2</span>
                  <p><strong className="text-[#031635]">Face ID & Voice PIN:</strong> Log in securely using camera facial scan or spoken PIN.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#031635] text-white flex items-center justify-center font-black text-xs shrink-0">3</span>
                  <p><strong className="text-[#031635]">Teach & Sell:</strong> List handmade pottery or offer 1-on-1 live appointments with direct bank payouts.</p>
                </div>
              </div>

              <Link href="/provider" className="inline-flex items-center gap-2 font-black text-sm text-[#031635] hover:underline pt-2">
                Open Service Provider Portal →
              </Link>
            </div>

            {/* For Consumers */}
            <div className="bg-white p-8 lg:p-10 rounded-3xl border border-[#E3E2E0] shadow-md space-y-6">
              <div className="flex items-center gap-3 border-b border-[#E3E2E0] pb-4">
                <span className="text-3xl">🛒</span>
                <div>
                  <h3 className="text-xl font-black text-[#031635]">For Learners & Buyers</h3>
                  <span className="text-xs font-bold text-[#44474E]">3 Simple Steps</span>
                </div>
              </div>

              <div className="space-y-4 text-sm font-semibold text-[#44474E]">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#FDBC13] text-[#031635] flex items-center justify-center font-black text-xs shrink-0">1</span>
                  <p><strong className="text-[#031635]">Create Consumer Account:</strong> Quick register with email, location, and topic interests.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#FDBC13] text-[#031635] flex items-center justify-center font-black text-xs shrink-0">2</span>
                  <p><strong className="text-[#031635]">AI Need Matchmaker:</strong> Chat with our local Ollama AI to segregate pottery, biryani videos, or Tanjore art.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#FDBC13] text-[#031635] flex items-center justify-center font-black text-xs shrink-0">3</span>
                  <p><strong className="text-[#031635]">Buy & Learn 1-on-1:</strong> Purchase authentic crafts or book interactive live video appointments.</p>
                </div>
              </div>

              <Link href="/consumer/login" className="inline-flex items-center gap-2 font-black text-sm text-[#031635] hover:underline pt-2">
                Open Consumer Flow →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM IMPACT STATISTICS */}
      <section id="impact" className="py-16 bg-[#031635] text-white">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <span className="text-4xl md:text-5xl font-black text-[#FDBC13] block">10,000+</span>
            <span className="text-xs md:text-sm font-extrabold text-slate-300 uppercase tracking-wider block mt-1">Service Providers</span>
          </div>
          <div>
            <span className="text-4xl md:text-5xl font-black text-[#FDBC13] block">50,000+</span>
            <span className="text-xs md:text-sm font-extrabold text-slate-300 uppercase tracking-wider block mt-1">1-on-1 Live Appointments</span>
          </div>
          <div>
            <span className="text-4xl md:text-5xl font-black text-[#FDBC13] block">100%</span>
            <span className="text-xs md:text-sm font-extrabold text-slate-300 uppercase tracking-wider block mt-1">Direct Bank Payouts</span>
          </div>
          <div>
            <span className="text-4xl md:text-5xl font-black text-[#FDBC13] block">4.95 ★</span>
            <span className="text-xs md:text-sm font-extrabold text-slate-300 uppercase tracking-wider block mt-1">Average Rating</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-[#E3E2E0] py-12">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#031635] text-[#FDBC13] rounded-xl flex items-center justify-center font-black">
              🤝
            </div>
            <span className="font-extrabold text-lg text-[#031635]">SilverHands</span>
          </div>

          <div className="flex flex-wrap gap-6 text-xs font-bold text-[#44474E]">
            <Link href="/provider" className="hover:text-[#031635]">Service Provider Portal</Link>
            <Link href="/consumer/login" className="hover:text-[#031635]">Consumer Login</Link>
            <Link href="/consumer/register" className="hover:text-[#031635]">Consumer Registration</Link>
            <Link href="/consumer/dashboard" className="hover:text-[#031635]">Consumer Dashboard</Link>
          </div>

          <span className="text-xs font-semibold text-[#44474E]">
            © {new Date().getFullYear()} SilverHands Platform. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
