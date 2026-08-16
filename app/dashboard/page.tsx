'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSavedProfile, voiceAgent, resetAllAccountsToBlank } from '@/lib/voice-agent';
import SocialMediaHub from '@/components/SocialMediaHub';
import { 
  ShieldCheck, Mic, Video, BookOpen, ShoppingBag, Smartphone, 
  Wallet, User, Sparkles, TrendingUp, Bell, Search, Star, MapPin, LogOut 
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userSkill, setUserSkill] = useState<string>('');
  const [userLocation, setUserLocation] = useState<string>('');

  useEffect(() => {
    const saved = getSavedProfile();
    if (saved && saved.name) {
      setUserName(saved.name);
      if (saved.skill) setUserSkill(saved.skill);
      if (saved.location) setUserLocation(saved.location);
    } else {
      setUserName(null);
    }
  }, []);

  return (
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col antialiased">
      {/* Premium Desktop Navigation Bar */}
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

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 bg-[#F4F3F1] p-1.5 rounded-full border border-[#E3E2E0]">
              <Link href="/dashboard" className="px-5 py-2 rounded-full bg-[#031635] text-white font-bold text-sm shadow-sm">
                Dashboard
              </Link>
              <Link href="/profile" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                My Profile
              </Link>
              <Link href="/video/create" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Video Studio
              </Link>
              <Link href="/assistant/voice" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Voice Assistant
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2 bg-[#2D5A27]/10 border border-[#2D5A27]/30 px-4 py-2 rounded-full text-xs font-extrabold text-[#2D5A27]">
              <ShieldCheck className="w-4 h-4 text-[#2D5A27]" /> Guardian Shield Active
            </div>

            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 bg-[#FDBC13] text-[#261900] px-5 py-2.5 rounded-2xl text-sm font-bold shadow-md hover:bg-[#F3B20B] transition active:scale-95"
            >
              <Mic className="w-4 h-4" /> Voice Mode
            </button>

            <button
              onClick={() => {
                if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
                resetAllAccountsToBlank();
                voiceAgent.resetState();
                router.push('/');
              }}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-sm font-bold transition shadow-sm"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Desktop Container */}
      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-6 lg:px-12 py-8 space-y-8">
        
        {/* Welcome Hero Banner */}
        <section className="bg-gradient-to-r from-[#031635] via-[#0A2540] to-[#1A365D] rounded-3xl p-8 md:p-12 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4 max-w-2xl z-10 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-[#FDBC13] backdrop-blur-md text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" /> Verified Senior Creator Portal
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
              Good Morning, {userName}!
            </h1>
            <p className="text-lg text-slate-300 font-light leading-relaxed">
              Your voice-driven creator portal is active. Manage your listings, share your expertise in {userSkill}, and view approved payments safely under Guardian Shield protection.
            </p>
            <div className="flex flex-wrap gap-4 pt-2 justify-center md:justify-start">
              <button
                onClick={() => router.push('/video/create')}
                className="px-6 py-3.5 bg-[#FDBC13] text-[#261900] font-bold rounded-2xl shadow-lg hover:bg-[#F3B20B] transition flex items-center gap-2"
              >
                <Video className="w-5 h-5" /> Record Video Lesson
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3.5 bg-white/10 text-white font-bold rounded-2xl hover:bg-white/20 backdrop-blur-md transition border border-white/20 flex items-center gap-2"
              >
                <Mic className="w-5 h-5 text-[#FDBC13]" /> Open Voice Assistant
              </button>
            </div>
          </div>

          <div className="w-full md:w-80 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-6 text-white space-y-4 shrink-0 shadow-lg">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-white/15 pb-2">
              <span>MONTHLY EARNINGS</span>
              <span className="text-[#FDBC13] flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> +24%</span>
            </div>
            <div className="text-4xl font-black text-[#FDBC13]">₹4,500</div>
            <div className="text-xs text-slate-300 flex items-center justify-between">
              <span>Approved by Guardian</span>
              <span className="font-bold text-emerald-400">✓ Verified</span>
            </div>
          </div>
        </section>

        {/* Dashboard 2-Column Wide Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column (8 Cols): Core Studio Actions */}
          <div className="lg:col-span-8 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-extrabold text-[#031635]">Creator Tools & Services</h2>
              <span className="text-sm font-semibold text-[#44474E]">Select an action below</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Card 1 */}
              <button
                onClick={() => router.push('/video/create')}
                className="group bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-3xl p-6 flex flex-col items-start justify-between gap-6 shadow-md hover:shadow-xl transition-all h-[220px] text-left"
              >
                <div className="w-14 h-14 bg-[#D8E2FF] text-[#031635] rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Video className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-[#031635] group-hover:text-[#031635]">Create Video</h3>
                  <p className="text-sm text-[#44474E] mt-1">Record short cooking or craft tutorials with AI assistance.</p>
                </div>
              </button>

              {/* Card 2 */}
              <button
                onClick={() => alert("Showing 3 active live classes!")}
                className="group bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-3xl p-6 flex flex-col items-start justify-between gap-6 shadow-md hover:shadow-xl transition-all h-[220px] text-left"
              >
                <div className="w-14 h-14 bg-[#FFDEA3] text-[#6B4D00] rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <BookOpen className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-[#031635]">My Classes</h3>
                  <p className="text-sm text-[#44474E] mt-1">3 active teaching sessions scheduled this week.</p>
                </div>
              </button>

              {/* Card 3 */}
              <button
                onClick={() => alert("Showing 5 handcrafted items!")}
                className="group bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-3xl p-6 flex flex-col items-start justify-between gap-6 shadow-md hover:shadow-xl transition-all h-[220px] text-left"
              >
                <div className="w-14 h-14 bg-[#E2F7D8] text-[#1E4E18] rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <ShoppingBag className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-[#031635]">My Products</h3>
                  <p className="text-sm text-[#44474E] mt-1">Manage homemade snacks, recipes, and craft listings.</p>
                </div>
              </button>

              {/* Card 4 */}
              <button
                onClick={() => alert("Connected to WhatsApp & YouTube!")}
                className="group bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-3xl p-6 flex flex-col items-start justify-between gap-6 shadow-md hover:shadow-xl transition-all h-[220px] text-left"
              >
                <div className="w-14 h-14 bg-[#E9E8E5] text-[#031635] rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Smartphone className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-[#031635]">Social Channels</h3>
                  <p className="text-sm text-[#44474E] mt-1">Connected to YouTube & WhatsApp broadcast.</p>
                </div>
              </button>

              {/* Card 5 */}
              <button
                onClick={() => alert(`Total earnings for ${userName}: ₹4,500`)}
                className="group bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-3xl p-6 flex flex-col items-start justify-between gap-6 shadow-md hover:shadow-xl transition-all h-[220px] text-left"
              >
                <div className="w-14 h-14 bg-amber-100 text-amber-800 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Wallet className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-[#031635]">My Earnings</h3>
                  <p className="text-sm text-[#44474E] mt-1">View payout history and guardian approvals.</p>
                </div>
              </button>

              {/* Card 6 */}
              <button
                onClick={() => router.push('/profile')}
                className="group bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-3xl p-6 flex flex-col items-start justify-between gap-6 shadow-md hover:shadow-xl transition-all h-[220px] text-left"
              >
                <div className="w-14 h-14 bg-[#031635] text-white rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                  <User className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-[#031635]">My Profile</h3>
                  <p className="text-sm text-[#44474E] mt-1">Preview your public listing card & credentials.</p>
                </div>
              </button>
            </div>

            {/* Social Media Cross-Posting Matrix Hub */}
            <SocialMediaHub />
          </div>

          {/* Right Column (4 Cols): Guardian & Live Activity Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-md space-y-5">
              <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-4">
                <h3 className="text-xl font-extrabold text-[#031635] flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#2D5A27]" /> Guardian Shield
                </h3>
                <span className="text-xs font-bold text-[#2D5A27] bg-[#2D5A27]/10 px-3 py-1 rounded-full border border-[#2D5A27]/30">
                  ACTIVE
                </span>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E3E2E0] space-y-1">
                  <div className="text-xs font-bold text-[#44474E] uppercase">Linked Guardian</div>
                  <div className="text-base font-extrabold text-[#031635]">Ramesh (Son)</div>
                  <div className="text-xs text-[#75777F]">Phone: +91 98765 43210</div>
                </div>

                <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E3E2E0] space-y-1">
                  <div className="text-xs font-bold text-[#44474E] uppercase">Approval Threshold</div>
                  <div className="text-base font-extrabold text-[#031635]">₹500 / Request</div>
                  <div className="text-xs text-emerald-700 font-semibold">Transactions above ₹500 require guardian consent</div>
                </div>
              </div>
            </div>

            {/* Quick Voice Assistant Launcher Widget */}
            <div className="bg-gradient-to-br from-[#031635] to-[#1a2b4b] rounded-3xl p-6 text-white shadow-xl space-y-4 text-center">
              <div className="w-16 h-16 bg-[#FDBC13] text-[#261900] rounded-full flex items-center justify-center mx-auto shadow-md">
                <Mic className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-bold">Voice Command Hub</h3>
                <p className="text-xs text-slate-300">Speak any request naturally without clicking.</p>
              </div>
              <button
                onClick={() => router.push('/')}
                className="w-full py-3.5 bg-[#FDBC13] text-[#261900] font-bold rounded-2xl shadow-md hover:bg-[#F3B20B] transition"
              >
                Launch Voice Assistant
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
