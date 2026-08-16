'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSavedProfile, voiceAgent, resetAllAccountsToBlank } from '@/lib/voice-agent';
import { Video, Mic, User, LogOut, ShieldCheck, Package } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userSkill, setUserSkill] = useState('');

  useEffect(() => {
    const saved = getSavedProfile();
    if (saved && saved.name) {
      setUserName(saved.name);
      if (saved.skill) setUserSkill(saved.skill);
    } else {
      router.push('/');
    }
  }, [router]);

  const handleLogout = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    resetAllAccountsToBlank();
    voiceAgent.resetState();
    router.push('/');
  };

  // The 5 core actions a senior creator needs
  const actions = [
    {
      id: 'record',
      emoji: '🎥',
      label: 'Record a Video',
      sublabel: 'Teach cooking, crafts or any skill',
      bg: 'bg-[#031635]',
      text: 'text-white',
      accent: 'text-[#FDBC13]',
      border: 'border-[#031635]',
      onClick: () => router.push('/video/create'),
    },
    {
      id: 'products',
      emoji: '🛍️',
      label: 'My Products',
      sublabel: 'Sell your homemade items',
      bg: 'bg-amber-50',
      text: 'text-amber-900',
      accent: 'text-amber-700',
      border: 'border-amber-200',
      onClick: () => router.push('/products'),
    },
    {
      id: 'voice',
      emoji: '🎙️',
      label: 'Talk to Assistant',
      sublabel: 'Speak any question or command',
      bg: 'bg-[#FDBC13]',
      text: 'text-[#1A1C1A]',
      accent: 'text-[#031635]',
      border: 'border-[#FDBC13]',
      onClick: () => router.push('/'),
    },
    {
      id: 'profile',
      emoji: '👤',
      label: 'My Profile',
      sublabel: 'View your public creator page',
      bg: 'bg-white',
      text: 'text-[#1A1C1A]',
      accent: 'text-[#44474E]',
      border: 'border-[#E3E2E0]',
      onClick: () => router.push('/profile'),
    },
    {
      id: 'earnings',
      emoji: '💰',
      label: 'My Earnings',
      sublabel: '₹4,500 approved this month',
      bg: 'bg-emerald-50',
      text: 'text-emerald-900',
      accent: 'text-emerald-700',
      border: 'border-emerald-200',
      onClick: () => alert('Your total earnings this month: ₹4,500\nApproved by your Guardian.'),
    },
  ];

  return (
    <div className="bg-[#FFFDF7] min-h-screen flex flex-col" style={{ fontFamily: "'Lexend', sans-serif" }}>

      {/* ── Simple top bar ── */}
      <header className="bg-white border-b-4 border-[#FDBC13] shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-14 h-14 bg-[#031635] rounded-2xl flex items-center justify-center text-2xl shadow-md">
              🤝
            </div>
            <div>
              <span className="font-black text-2xl text-[#031635] block leading-tight">SilverHands</span>
              <span className="text-sm font-semibold text-[#44474E] block">Senior Creator Platform</span>
            </div>
          </Link>

          {/* Sign out */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-base font-bold transition shadow-sm active:scale-95"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 space-y-10">

        {/* Welcome */}
        <div className="text-center space-y-3">
          <p className="text-2xl font-semibold text-[#44474E]">Welcome back,</p>
          <h1 className="text-5xl md:text-6xl font-black text-[#031635] leading-tight">
            {userName || '…'} 👋
          </h1>
          {userSkill && (
            <p className="text-xl text-[#44474E] font-medium">
              Expert in <span className="font-bold text-[#031635]">{userSkill}</span>
            </p>
          )}
        </div>

        {/* Guardian badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-3 bg-emerald-50 border-2 border-emerald-300 px-6 py-3 rounded-2xl shadow-sm">
            <ShieldCheck className="w-6 h-6 text-emerald-700 shrink-0" />
            <span className="text-lg font-bold text-emerald-800">
              Guardian Protection is Active
            </span>
          </div>
        </div>

        {/* 4 big action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {actions.map(action => (
            <button
              key={action.id}
              onClick={action.onClick}
              className={`
                ${action.bg} ${action.text} border-2 ${action.border}
                rounded-3xl p-8 flex items-center gap-6
                shadow-md hover:shadow-xl active:scale-95
                transition-all duration-150 text-left w-full
              `}
            >
              {/* Big emoji icon */}
              <div className="text-5xl shrink-0 leading-none">
                {action.emoji}
              </div>
              {/* Text */}
              <div>
                <div className="text-2xl font-black leading-tight">
                  {action.label}
                </div>
                <div className={`text-base font-semibold mt-1 ${action.accent}`}>
                  {action.sublabel}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Quick nav strip */}
        <div className="flex flex-wrap justify-center gap-4 pt-2">
          <Link
            href="/video/create"
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl text-base font-bold text-[#031635] transition shadow-sm"
          >
            <Video className="w-5 h-5" /> Video Studio
          </Link>
          <Link
            href="/products"
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl text-base font-bold text-[#031635] transition shadow-sm"
          >
            <Package className="w-5 h-5" /> My Products
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl text-base font-bold text-[#031635] transition shadow-sm"
          >
            <Mic className="w-5 h-5" /> Voice Assistant
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl text-base font-bold text-[#031635] transition shadow-sm"
          >
            <User className="w-5 h-5" /> My Profile
          </Link>
        </div>

        {/* Footer note */}
        <p className="text-center text-base text-[#75777F] font-medium pb-4">
          Need help? Tap <strong className="text-[#031635]">Talk to Assistant</strong> and speak your question.
        </p>

      </main>
    </div>
  );
}
