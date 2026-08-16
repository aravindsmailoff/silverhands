'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { voiceService } from '@/lib/voice';

export default function VoiceOnboardingPage() {
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [spokenName, setSpokenName] = useState('Lakshmi Amma');

  const toggleVoiceRecording = () => {
    if (isListening) {
      voiceService.stopListening();
      setIsListening(false);
    } else {
      setIsListening(true);
      voiceService.startListening({
        onResult: (result) => {
          if (result.transcript) {
            setSpokenName(result.transcript);
          }
        },
        onError: (err) => {
          console.warn('Speech recognition error:', err);
          setIsListening(false);
        },
        onEnd: () => {
          setIsListening(false);
        }
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1A1C1A] flex flex-col antialiased">
      <main className="flex-1 flex flex-col max-w-[800px] w-full mx-auto px-5 md:px-10 py-10 relative overflow-hidden">
        {/* Help Button (Top Right) */}
        <div className="absolute top-5 right-5 md:top-8 md:right-10 z-10">
          <button
            onClick={() => alert("Please speak your full name into the microphone.")}
            className="flex items-center justify-center gap-2 bg-[#FAF9F6] text-[#1A1C1A] border-2 border-[#C5C6CF] rounded-full px-5 h-14 shadow-md active:translate-y-[2px] transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              help
            </span>
            <span className="text-lg font-semibold">Help</span>
          </button>
        </div>

        {/* Header Prompt */}
        <header className="text-center mt-12 md:mt-20 mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#031635] mb-3">
            What is your name?
          </h1>
          <p className="text-xl text-[#44474E] font-normal">
            Please speak clearly into the device.
          </p>
        </header>

        {/* Central Voice Interaction Area */}
        <div className="flex-1 flex flex-col items-center justify-center relative min-h-[300px]">
          {/* Pulsing Microphone */}
          <div className="relative w-48 h-48 flex items-center justify-center mb-8">
            <div className="absolute inset-0 rounded-full bg-[#FDBC13] opacity-20 pulse-ring" />
            <div className="absolute inset-4 rounded-full bg-[#FDBC13] opacity-40 pulse-ring" style={{ animationDelay: '0.5s' }} />

            <button
              onClick={toggleVoiceRecording}
              className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center shadow-xl active:scale-95 transition-all ${
                isListening
                  ? 'bg-rose-600 border-4 border-rose-300'
                  : 'bg-[#031635]'
              }`}
            >
              <span className="material-symbols-outlined text-white text-6xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                mic
              </span>
            </button>
          </div>

          {/* Live Speech Recognition Feedback Card */}
          <div className="bg-[#FAF9F6] border-2 border-[#C5C6CF] rounded-2xl p-6 w-full max-w-md text-center shadow-md">
            <p className="text-lg text-[#44474E] mb-1 font-medium">We heard:</p>
            <p className="text-3xl font-extrabold text-[#031635]">
              &quot;{spokenName}&quot;
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-auto pt-8 flex flex-col md:flex-row gap-4 pb-8">
          <button
            onClick={() => setSpokenName('')}
            className="flex-1 h-[60px] flex items-center justify-center gap-3 bg-[#FAF9F6] text-[#031635] border-2 border-[#031635] rounded-xl active:bg-[#E3E2E0] transition-all"
          >
            <span className="material-symbols-outlined text-3xl">refresh</span>
            <span className="text-xl font-bold">Try Again</span>
          </button>
          <button
            onClick={() => router.push('/onboarding/email')}
            className="flex-1 h-[60px] flex items-center justify-center gap-3 bg-[#031635] text-white rounded-xl shadow-lg active:translate-y-[2px] transition-all"
          >
            <span className="material-symbols-outlined text-3xl">check</span>
            <span className="text-xl font-bold">Yes, Continue</span>
          </button>
        </div>
      </main>
    </div>
  );
}
