'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { voiceService } from '@/lib/voice';
import { Mic, ArrowLeft, Video, User, LayoutDashboard, UserPlus, LogIn, Sparkles, Volume2 } from 'lucide-react';

export default function VoiceAssistantPage() {
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [activeSpeech, setActiveSpeech] = useState<string>('Initializing Voice Assistant...');
  const [aiSpeakingText, setAiSpeakingText] = useState<string>(
    "Hello! I am your SilverHands Voice Assistant. What would you like to do today? You can say 'Record a video', 'Go to Dashboard', 'View my Profile', 'Create Account', or 'Sign In'."
  );
  const [isNavigating, setIsNavigating] = useState(false);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    // AI Greets user out loud when Voice Assistant opens
    const welcomePrompt = "Hello! I am your SilverHands Voice Assistant. What would you like to do today? You can say 'Record a video', 'Go to Dashboard', 'View my Profile', 'Create Account', or 'Sign In'.";
    setAiSpeakingText(welcomePrompt);
    setActiveSpeech("AI Speaking...");

    voiceService.speak(welcomePrompt, 'en-IN', () => {
      if (isMounted.current) {
        startListeningForNavigationCommands();
      }
    });

    return () => {
      isMounted.current = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      voiceService.stopListening();
    };
  }, []);

  // Continuous Navigation Speech Recognition Engine
  const startListeningForNavigationCommands = () => {
    setIsListening(true);
    setActiveSpeech("Listening for your command... Speak now.");

    voiceService.startListening({
      onResult: (result) => {
        if (!result.transcript || isNavigating) return;

        const spoken = result.transcript.toLowerCase().trim();
        setActiveSpeech(`"${result.transcript}"`);

        // Match Spoken Navigation Intent
        if (spoken.includes('video') || spoken.includes('record') || spoken.includes('studio') || spoken.includes('make video')) {
          handleNavigationIntent('/video/create', "Navigating to Video Studio...");
        } else if (spoken.includes('dashboard') || spoken.includes('home') || spoken.includes('main')) {
          handleNavigationIntent('/dashboard', "Navigating to your Dashboard...");
        } else if (spoken.includes('profile') || spoken.includes('my profile') || spoken.includes('view profile')) {
          handleNavigationIntent('/profile', "Navigating to your Profile...");
        } else if (spoken.includes('create account') || spoken.includes('register') || spoken.includes('new account')) {
          handleNavigationIntent('/onboarding/voice', "Starting Voice Account Creation...");
        } else if (spoken.includes('sign in') || spoken.includes('login') || spoken.includes('log in') || spoken.includes('photo sign in')) {
          handleNavigationIntent('/?signin=true', "Opening Sign In...");
        }
      },
      onError: () => {
        if (isMounted.current && !isNavigating) {
          setTimeout(() => startListeningForNavigationCommands(), 1000);
        }
      },
      onEnd: () => {
        if (isMounted.current && !isNavigating) {
          setIsListening(false);
        }
      }
    });
  };

  const handleNavigationIntent = (destinationUrl: string, speechAnnouncement: string) => {
    setIsNavigating(true);
    voiceService.stopListening();
    setIsListening(false);
    setActiveSpeech(speechAnnouncement);

    voiceService.speak(speechAnnouncement, 'en-IN', () => {
      router.push(destinationUrl);
    });
  };

  const toggleMicManual = () => {
    if (isListening) {
      voiceService.stopListening();
      setIsListening(false);
      setActiveSpeech('Microphone paused. Tap mic button to listen again.');
    } else {
      startListeningForNavigationCommands();
    }
  };

  return (
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col items-center justify-between antialiased">
      {/* Top Header */}
      <header className="w-full max-w-screen-xl flex items-center justify-between px-6 py-5 z-50">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#E3E2E0] rounded-2xl text-sm font-bold text-[#031635] shadow-sm hover:bg-[#F4F3F1] transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black shadow-md">
            🤝
          </div>
          <span className="font-extrabold text-xl text-[#031635]">SilverHands Voice Navigation</span>
        </div>
      </header>

      {/* Main Assistant Body */}
      <main className="flex-1 w-full max-w-screen-md px-6 py-6 flex flex-col items-center justify-center gap-8 text-center my-auto">
        
        {/* Animated Listening Mic Sphere */}
        <div className="relative flex items-center justify-center w-48 h-48 my-4">
          {isListening && (
            <>
              <div className="absolute inset-0 rounded-full bg-[#FDBC13]/30 border-4 border-[#FDBC13] animate-ping opacity-60" />
              <div className="absolute inset-2 rounded-full bg-[#FDBC13]/20 border-4 border-[#FDBC13] animate-pulse" />
            </>
          )}

          <button
            onClick={toggleMicManual}
            className={`relative z-10 w-36 h-36 rounded-full shadow-2xl flex flex-col items-center justify-center transition-all active:scale-95 border-4 border-white ${
              isListening ? 'bg-[#031635] text-[#FDBC13]' : 'bg-slate-700 text-white'
            }`}
          >
            <Mic className={`w-14 h-14 ${isListening ? 'animate-bounce' : ''}`} />
            <span className="text-xs font-black uppercase tracking-wider mt-1">
              {isListening ? 'LISTENING' : 'TAP MIC'}
            </span>
          </button>
        </div>

        {/* AI Prompt Announcement Box */}
        <div className="bg-white border-2 border-[#031635] rounded-3xl p-6 shadow-xl w-full space-y-3">
          <div className="flex items-center justify-center gap-2 text-xs font-extrabold uppercase text-[#031635] tracking-wider">
            <Volume2 className="w-4 h-4 text-[#FDBC13]" /> AI Voice Assistant Prompt
          </div>
          <p className="text-xl md:text-2xl font-black text-[#031635] leading-relaxed">
            &quot;{aiSpeakingText}&quot;
          </p>

          <div className="pt-2 border-t border-[#E3E2E0]">
            <span className="text-xs font-extrabold text-[#75777F] uppercase tracking-wider block mb-1">
              Spoken Transcript Heard
            </span>
            <p className="text-lg font-bold text-rose-700">
              {activeSpeech}
            </p>
          </div>
        </div>

        {/* Quick Spoken Voice Navigation Destination Cards */}
        <div className="w-full space-y-4 pt-2">
          <div className="text-left text-sm font-extrabold text-[#44474E] uppercase tracking-wider">
            Say any command to navigate instantly:
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            <button
              onClick={() => handleNavigationIntent('/video/create', "Navigating to Video Studio...")}
              className="p-5 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl flex items-center gap-4 text-left shadow-sm hover:shadow-md transition group"
            >
              <div className="w-12 h-12 bg-rose-100 text-rose-800 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <div className="font-extrabold text-[#031635] text-base">&quot;Record a video&quot;</div>
                <div className="text-xs text-[#75777F]">Open Video Studio</div>
              </div>
            </button>

            <button
              onClick={() => handleNavigationIntent('/dashboard', "Navigating to Dashboard...")}
              className="p-5 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl flex items-center gap-4 text-left shadow-sm hover:shadow-md transition group"
            >
              <div className="w-12 h-12 bg-blue-100 text-blue-800 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <LayoutDashboard className="w-6 h-6" />
              </div>
              <div>
                <div className="font-extrabold text-[#031635] text-base">&quot;Go to Dashboard&quot;</div>
                <div className="text-xs text-[#75777F]">Open Main Dashboard</div>
              </div>
            </button>

            <button
              onClick={() => handleNavigationIntent('/profile', "Navigating to Profile...")}
              className="p-5 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl flex items-center gap-4 text-left shadow-sm hover:shadow-md transition group"
            >
              <div className="w-12 h-12 bg-amber-100 text-amber-800 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <User className="w-6 h-6" />
              </div>
              <div>
                <div className="font-extrabold text-[#031635] text-base">&quot;View my Profile&quot;</div>
                <div className="text-xs text-[#75777F]">Open Senior Profile</div>
              </div>
            </button>

            <button
              onClick={() => handleNavigationIntent('/onboarding/voice', "Starting Voice Account Creation...")}
              className="p-5 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl flex items-center gap-4 text-left shadow-sm hover:shadow-md transition group"
            >
              <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <UserPlus className="w-6 h-6" />
              </div>
              <div>
                <div className="font-extrabold text-[#031635] text-base">&quot;Create Account&quot;</div>
                <div className="text-xs text-[#75777F]">Create profile with Voice AI</div>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
