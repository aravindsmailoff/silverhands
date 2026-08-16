'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSavedProfile, voiceAgent, setActiveUserAccount } from '@/lib/voice-agent';
import { Video, Mic, User, LogOut, ShieldCheck, Package } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userSkill, setUserSkill] = useState('');

  // Live Streaming States
  const [isLive, setIsLive] = useState(false);
  const [meetUrl, setMeetUrl] = useState('');
  const [liveTitle, setLiveTitle] = useState('');
  const [streamInfo, setStreamInfo] = useState<any>(null);
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    const saved = getSavedProfile();
    if (saved && saved.name) {
      setUserName(saved.name);
      if (saved.skill) setUserSkill(saved.skill);

      const creatorId = saved.name.trim().toLowerCase().replace(/\s+/g, '_');
      // Check if there is an active live stream
      fetch('/api/live-streams')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.streams)) {
            const active = data.streams.find((s: any) => s.creator_id === creatorId);
            if (active) {
              setIsLive(true);
              setMeetUrl(active.meet_url);
              setLiveTitle(active.title);
              setStreamInfo(active);
              setViewerCount(active.viewer_count);
            }
          }
        })
        .catch(err => console.warn('[Live Stream check error]:', err));
    } else {
      router.push('/');
    }
  }, [router]);

  // Poll viewer count if live
  useEffect(() => {
    if (!isLive || !streamInfo) return;
    const interval = setInterval(() => {
      fetch('/api/live-streams')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.streams)) {
            const active = data.streams.find((s: any) => s.id === streamInfo.id);
            if (active) {
              setViewerCount(active.viewer_count);
            }
          }
        })
        .catch(err => console.warn('[Viewer count poll error]:', err));
    }, 3000);
    return () => clearInterval(interval);
  }, [isLive, streamInfo]);

  const handleToggleLive = async () => {
    const savedProfile = getSavedProfile();
    const creatorId = savedProfile?.name?.trim().toLowerCase().replace(/\s+/g, '_') || 'creator';
    const creatorName = savedProfile?.name || 'Senior Creator';

    if (isLive) {
      // End Live Stream
      await fetch(`/api/live-streams?creatorId=${creatorId}`, { method: 'DELETE' });
      setIsLive(false);
      setStreamInfo(null);
      setViewerCount(0);
    } else {
      // Start Live Stream
      if (!meetUrl.trim()) {
        alert('Please enter your Google Meet URL to go live!');
        return;
      }
      const titleText = liveTitle.trim() || `${creatorName}'s Live Masterclass`;
      const res = await fetch('/api/live-streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId,
          creatorName,
          title: titleText,
          meetUrl: meetUrl.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setIsLive(true);
        setStreamInfo(data.stream);
        setViewerCount(0);
      } else {
        alert(data.error || 'Failed to start live stream');
      }
    }
  };

  const handleLogout = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setActiveUserAccount('');
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
    {
      id: 'search',
      emoji: '🔍',
      label: 'Search Providers',
      sublabel: 'View other senior creators',
      bg: 'bg-sky-50',
      text: 'text-sky-900',
      accent: 'text-sky-700',
      border: 'border-sky-200',
      onClick: () => router.push('/providers'),
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

        {/* Live Meeting Studio Controls */}
        <div className="bg-white border border-[#E3E2E0] rounded-3xl p-6 md:p-8 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎥</span>
              <div>
                <h3 className="text-xl font-black text-[#031635]">Live Meeting Studio</h3>
                <p className="text-xs font-semibold text-[#75777F]">Start an instant masterclass and interact with learners</p>
              </div>
            </div>
            {isLive && (
              <span className="flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-black uppercase tracking-wider animate-pulse">
                <span className="w-2 h-2 bg-red-600 rounded-full" /> LIVE
              </span>
            )}
          </div>

          {!isLive ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#031635] mb-1.5">Masterclass Title</label>
                  <input
                    type="text"
                    value={liveTitle}
                    onChange={(e) => setLiveTitle(e.target.value)}
                    placeholder="e.g. Traditional clay pottery workshop"
                    className="w-full px-4 py-3 bg-[#F4F3F1] border border-[#E3E2E0] rounded-2xl text-sm font-semibold text-[#031635] focus:outline-none focus:ring-2 focus:ring-[#031635]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#031635] mb-1.5">Google Meet Meeting Link</label>
                  <input
                    type="text"
                    value={meetUrl}
                    onChange={(e) => setMeetUrl(e.target.value)}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    className="w-full px-4 py-3 bg-[#F4F3F1] border border-[#E3E2E0] rounded-2xl text-sm font-semibold text-[#031635] focus:outline-none focus:ring-2 focus:ring-[#031635]"
                  />
                </div>
              </div>
              <button
                onClick={handleToggleLive}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-extrabold text-lg rounded-2xl shadow-md transition"
              >
                Go Live Now (Notify Consumers)
              </button>
            </div>
          ) : (
            <div className="bg-red-50/50 border border-red-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="font-extrabold text-red-900">{liveTitle || "Live Masterclass Session"}</h4>
                  <p className="text-sm font-semibold text-red-700 mt-1">Learners can see and join from their marketplace portal</p>
                  <a
                    href={meetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-bold text-red-950 underline mt-2 block"
                  >
                    Open Google Meet Link: {meetUrl}
                  </a>
                </div>
                <div className="bg-red-600 text-white px-4 py-3 rounded-2xl text-center md:text-right shrink-0">
                  <div className="text-2xl font-black">{viewerCount}</div>
                  <div className="text-xs font-bold uppercase tracking-wider">Active Viewers</div>
                </div>
              </div>
              <button
                onClick={handleToggleLive}
                className="w-full py-4 bg-[#031635] hover:bg-[#072147] text-white font-extrabold text-lg rounded-2xl transition"
              >
                Stop Live Stream & End Meeting
              </button>
            </div>
          )}
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
            href="/profile"
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl text-base font-bold text-[#031635] transition shadow-sm"
          >
            <User className="w-5 h-5" /> My Profile
          </Link>
          <Link
            href="/providers"
            className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-[#E3E2E0] hover:border-[#031635] rounded-2xl text-base font-bold text-[#031635] transition shadow-sm"
          >
            🔍 Search Providers
          </Link>
        </div>

        {/* Footer note */}
        <p className="text-center text-base text-[#75777F] font-medium pb-4">
          Need help? Navigate to <strong className="text-[#031635]">My Profile</strong> and click <strong className="text-[#031635]">Edit Profile with Voice</strong> to update details.
        </p>

      </main>
    </div>
  );
}
