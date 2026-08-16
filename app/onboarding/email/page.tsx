'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { voiceService } from '@/lib/voice';
import { getSavedProfile, saveProfileState } from '@/lib/voice-agent';
import { Mail, CheckCircle2, ShieldCheck, ArrowRight, Sparkles, LogIn } from 'lucide-react';

export default function EmailSetupPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('Lakshmi');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'native' | 'google' | null>(null);

  useEffect(() => {
    const profile = getSavedProfile();
    if (profile.name) {
      setUserName(profile.name.split(' ')[0]);
    }
  }, []);

  const cleanUserSlug = userName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'lakshmi';

  const selectNativeEmail = (email: string) => {
    const profile = getSavedProfile();
    const updated = { ...profile, availability: email };
    saveProfileState(updated);
    voiceService.speak(`Your SilverHands creator email ${email} has been provisioned.`, 'en-IN');
    router.push('/profile');
  };

  const handleGoogleConnect = () => {
    alert("Connecting via Google OAuth Identity Services...");
    selectNativeEmail(`${cleanUserSlug}.google@gmail.com`);
  };

  const handleVoiceCreate = () => {
    if (isVoiceListening) {
      voiceService.stopListening();
      setIsVoiceListening(false);
    } else {
      setIsVoiceListening(true);
      voiceService.speak("Say 'SilverHands Email' or 'Google' to choose your account option.", 'en-IN');
      setTimeout(() => {
        setIsVoiceListening(false);
        selectNativeEmail(`${cleanUserSlug}@creators.silverhands.in`);
      }, 3000);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1A1C1A] flex flex-col font-['Lexend',sans-serif] antialiased">
      {/* Top Header */}
      <header className="w-full flex items-center justify-between px-5 md:px-10 h-16 pt-2 max-w-screen-md mx-auto">
        <Link
          href="/"
          className="flex items-center gap-2 text-[#1A1C1A] hover:bg-[#E9E8E5] rounded-full px-4 py-2 transition-colors min-h-[56px]"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="text-lg font-semibold">Back</span>
        </Link>
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#2D5A27] bg-[#2D5A27]/10 px-3 py-1.5 rounded-full border border-[#2D5A27]/30">
          <ShieldCheck className="w-4 h-4" /> Identity Protection
        </div>
      </header>

      <main className="flex-1 w-full max-w-screen-md mx-auto px-5 md:px-10 py-6 flex flex-col gap-6">
        {/* Intro Section */}
        <section className="text-center flex flex-col gap-3 items-center">
          <div className="w-20 h-20 bg-[#031635] text-white rounded-full flex items-center justify-center mb-1 shadow-md">
            <Mail className="w-10 h-10 text-[#FDBC13]" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-[#031635]">
            Choose Your Email Identity
          </h1>
          <p className="text-lg text-[#44474E] max-w-lg leading-relaxed">
            Welcome, <span className="font-bold text-[#031635]">{userName}</span>! We can create a managed SilverHands creator email or connect your existing Google account.
          </p>
        </section>

        {/* Option 1: Native Managed Creator Email */}
        <section className="bg-white border-2 border-[#031635] rounded-2xl p-6 shadow-lg space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#2D5A27] uppercase tracking-wider bg-[#2D5A27]/10 px-3 py-1 rounded-full">
              <Sparkles className="w-4 h-4" /> Recommended for Seniors
            </div>
            <span className="text-xs text-[#75777F] font-bold">INSTANT & ZERO CAPTCHA</span>
          </div>

          <div className="space-y-1">
            <h3 className="text-2xl font-extrabold text-[#031635]">
              SilverHands Creator Email
            </h3>
            <p className="text-sm text-[#44474E]">
              Managed automatically by SilverHands so you don&apos;t have to memorize passwords or pass verification checks.
            </p>
          </div>

          <div className="p-4 bg-[#F4F3F1] rounded-xl border border-[#E3E2E0] font-mono text-lg font-bold text-[#031635] flex items-center justify-between">
            <span>{cleanUserSlug}@creators.silverhands.in</span>
            <CheckCircle2 className="w-6 h-6 text-[#2D5A27]" />
          </div>

          <button
            onClick={() => selectNativeEmail(`${cleanUserSlug}@creators.silverhands.in`)}
            className="w-full py-4 bg-[#031635] text-white text-lg font-bold rounded-xl shadow-md flex items-center justify-center gap-2 hover:bg-[#1a2b4b]"
          >
            Provision {cleanUserSlug}@creators.silverhands.in <ArrowRight className="w-5 h-5 text-[#FDBC13]" />
          </button>
        </section>

        {/* Option 2: Connect Existing Google / Gmail Account */}
        <section className="bg-white border-2 border-[#E3E2E0] rounded-2xl p-6 shadow-md space-y-4">
          <div className="space-y-1">
            <h3 className="text-xl font-extrabold text-[#031635]">
              Connect Existing Google / Gmail Account
            </h3>
            <p className="text-sm text-[#44474E]">
              Already have a Gmail account? Sign in with Google to grant OAuth permissions for YouTube and social media.
            </p>
          </div>

          <button
            onClick={handleGoogleConnect}
            className="w-full py-4 bg-white border-2 border-[#C5C6CF] text-[#031635] text-lg font-bold rounded-xl shadow-sm flex items-center justify-center gap-3 hover:bg-[#EFEEEB] transition"
          >
            <LogIn className="w-5 h-5 text-[#031635]" /> Sign in with Google (OAuth)
          </button>
        </section>

        {/* Voice Option CTA */}
        <div className="pt-2 text-center">
          <button
            onClick={handleVoiceCreate}
            className="px-6 py-3 bg-[#FDBC13] text-[#261900] text-sm font-bold rounded-full shadow-md hover:bg-[#F3B20B] inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              mic
            </span>
            Choose Option Using Voice
          </button>
        </div>
      </main>
    </div>
  );
}
