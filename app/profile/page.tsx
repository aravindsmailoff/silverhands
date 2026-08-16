'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSavedProfile, ProfileState, voiceAgent, resetAllAccountsToBlank, getActiveUserAccount, getSavedSecurityCredentials } from '@/lib/voice-agent';
import { 
  ShieldCheck, Mic, CheckCircle2, Star, MapPin, Languages, 
  ChefHat, Award, ArrowRight, Edit3, ArrowLeft, LogOut 
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileState>({
    name: null,
    skill: null,
    experience_years: null,
    location: null,
    language: null,
    services: [],
    availability: null
  });

  const [userFacePhoto, setUserFacePhoto] = useState<string | null>(null);
  const [recordedVideos, setRecordedVideos] = useState<any[]>([]);

  useEffect(() => {
    const activeName = getActiveUserAccount();
    const loaded = getSavedProfile(activeName || undefined);
    if (!activeName && (!loaded || !loaded.name)) {
      router.push('/');
      return;
    }

    if (loaded && loaded.name) {
      setProfile(loaded);
    }

    // Check Face ID snapshot from local security credentials
    if (activeName) {
      const sec = getSavedSecurityCredentials(activeName);
      if (sec && sec.face && sec.face.photoUrl) {
        setUserFacePhoto(sec.face.photoUrl);
      }
    }

    const currentName = activeName || loaded.name || '';

    // Fetch user details & Face ID photo from Railway PostgreSQL Database API
    if (currentName) {
      fetch('/api/users/sync')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.accounts && data.accounts.length > 0) {
            const userAcc = data.accounts.find((a: any) => 
              (a.user_name || '').toLowerCase() === currentName.toLowerCase()
            );

            if (userAcc) {
              setProfile(prev => ({
                ...prev,
                name: userAcc.user_name || prev.name,
                skill: userAcc.skill || prev.skill,
                experience_years: userAcc.experience_years || prev.experience_years,
                location: userAcc.location || prev.location,
                language: userAcc.language || prev.language,
                services: (userAcc.services && userAcc.services !== '[]') 
                  ? (typeof userAcc.services === 'string' ? JSON.parse(userAcc.services) : userAcc.services) 
                  : prev.services
              }));

              if (userAcc.face_photo_url) {
                setUserFacePhoto(userAcc.face_photo_url);
              }
            }
          }
        })
        .catch(err => console.warn('[PostgreSQL Sync Warning]:', err));

      // Fetch stored videos belonging STRICTLY to this user
      fetch(`/api/videos?creatorName=${encodeURIComponent(currentName)}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.videos) {
            setRecordedVideos(data.videos.map((v: any) => ({
              id: v.id,
              topic: v.topic,
              description: v.description,
              recordedAt: new Date(v.recorded_at).toLocaleDateString(),
              videoUrl: v.video_data || v.video_url
            })));
          } else if (typeof window !== 'undefined') {
            const saved = JSON.parse(localStorage.getItem('silverhands_recorded_videos') || '[]');
            const userVids = saved.filter((v: any) => !v.creatorName || (v.creatorName || '').toLowerCase() === currentName.toLowerCase());
            setRecordedVideos(userVids);
          }
        })
        .catch(() => {
          if (typeof window !== 'undefined') {
            const saved = JSON.parse(localStorage.getItem('silverhands_recorded_videos') || '[]');
            const userVids = saved.filter((v: any) => !v.creatorName || (v.creatorName || '').toLowerCase() === currentName.toLowerCase());
            setRecordedVideos(userVids);
          }
        });
    }
  }, []);

  const clearOldVideos = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('silverhands_recorded_videos');
    }
    setRecordedVideos([]);
    alert("Old video cache cleared! Now record a new video in Video Studio to generate your dynamic AI description.");
  };

  const displayName = profile.name || 'Creator Profile';
  const displaySkill = profile.skill || 'Skilled Artisan';
  const displayExperience = profile.experience_years ? `${profile.experience_years}+ Years Experience` : 'Experienced Creator';
  const displayLocation = profile.location || 'India';
  const displayLanguage = profile.language || 'English';
  const displayServices = profile.services.length > 0 ? profile.services : ['Online Lessons'];

  return (
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col antialiased">
      {/* Premium Desktop Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                🤝
              </div>
              <div>
                <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
                <span className="text-xs font-semibold text-[#44474E] tracking-widest uppercase block -mt-1">Creator Profile</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1 bg-[#F4F3F1] p-1.5 rounded-full border border-[#E3E2E0]">
              <Link href="/dashboard" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Dashboard
              </Link>
              <Link href="/profile" className="px-5 py-2 rounded-full bg-[#031635] text-white font-bold text-sm shadow-sm">
                My Profile
              </Link>
              <Link href="/video/create" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Video Studio
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 px-4 py-2 bg-[#EFEEEB] hover:bg-[#E3E2E0] rounded-2xl text-sm font-bold text-[#031635] transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
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

      {/* Main Desktop Profile Layout Container */}
      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-6 lg:px-12 py-8 space-y-8">
        
        {/* Profile Hero Header */}
        <section className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-8 shadow-md">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
            <div className="w-36 h-36 rounded-3xl overflow-hidden border-4 border-[#031635] bg-[#031635] text-white flex items-center justify-center text-6xl font-black shadow-xl shrink-0 relative">
              {userFacePhoto ? (
                <img src={userFacePhoto} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span>👴</span>
              )}
            </div>

            <div className="space-y-4 text-center md:text-left flex-1">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                <h1 className="text-3xl md:text-4xl font-black text-[#031635]">{displayName}</h1>
                <span className="bg-[#2D5A27] text-white font-bold text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1 shadow-sm">
                  <CheckCircle2 className="w-4 h-4" /> Guardian Verified
                </span>
              </div>

              <p className="text-xl font-bold text-[#44474E] flex items-center justify-center md:justify-start gap-2">
                <ChefHat className="w-6 h-6 text-[#031635]" /> {displaySkill}
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 text-sm font-semibold text-[#44474E] pt-1">
                <span className="flex items-center gap-1.5"><Award className="w-4 h-4 text-[#FDBC13]" /> {displayExperience}</span>
                <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-[#031635]" /> {displayLocation}</span>
                <span className="flex items-center gap-1.5"><Languages className="w-4 h-4 text-[#031635]" /> Spoken Language: {displayLanguage}</span>
              </div>
            </div>

            <div className="shrink-0 flex flex-col gap-3 w-full md:w-auto">
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3.5 bg-[#FDBC13] text-[#261900] font-bold rounded-2xl shadow-md hover:bg-[#F3B20B] transition flex items-center justify-center gap-2"
              >
                <Mic className="w-5 h-5" /> Edit Profile with Voice
              </button>
            </div>
          </div>
        </section>

        {/* 2-Column Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column (8 Cols): Offerings & Biography */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-8 shadow-md space-y-6">
              <h2 className="text-2xl font-extrabold text-[#031635]">Service Offerings & Classes</h2>
              <p className="text-[#44474E] text-base leading-relaxed">
                These creator offerings were generated by SilverHands AI during voice onboarding based on expertise in {displaySkill}.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {displayServices.map((srv, idx) => (
                  <div key={idx} className="bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl p-5 space-y-2 shadow-sm">
                    <div className="w-10 h-10 bg-[#D8E2FF] text-[#031635] rounded-xl flex items-center justify-center font-bold">
                      #{idx + 1}
                    </div>
                    <div className="text-lg font-extrabold text-[#031635]">{srv}</div>
                    <div className="text-xs text-[#75777F]">Available for online & local bookings</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Video Showcase Widget */}
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-8 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-extrabold text-[#031635]">Featured Video Lessons</h2>
                <div className="flex items-center gap-2">
                  {recordedVideos.length > 0 && (
                    <button
                      onClick={clearOldVideos}
                      className="text-xs font-bold text-rose-700 hover:underline flex items-center gap-1 bg-rose-50 px-3 py-1.5 rounded-full border border-rose-200"
                    >
                      🗑️ Clear Old Test Videos
                    </button>
                  )}
                  <button
                    onClick={() => router.push('/video/create')}
                    className="text-sm font-bold text-[#031635] hover:underline flex items-center gap-1 bg-[#D8E2FF] px-4 py-2 rounded-full border border-[#031635]/20"
                  >
                    <Edit3 className="w-4 h-4" /> Record New Video
                  </button>
                </div>
              </div>

              {recordedVideos.length > 0 ? (
                <div className="space-y-4">
                  {recordedVideos.map((vid, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="w-full bg-slate-900 rounded-2xl overflow-hidden border-2 border-[#031635] shadow-lg">
                        <video src={vid.videoUrl} controls className="w-full max-h-[360px] object-cover" />
                      </div>
                      <div className="flex flex-col gap-2 px-1">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-[#031635] text-lg">&quot;{vid.topic || 'Senior Lesson Video'}&quot;</span>
                          <span className="text-xs font-semibold text-[#75777F]">Recorded on {vid.recordedAt}</span>
                        </div>
                        <p className="text-sm text-[#031635] bg-[#FAF9F6] p-3.5 rounded-xl border border-[#E3E2E0] leading-relaxed font-medium">
                          ✨ <span className="font-extrabold text-[#031635]">Video Description:</span> {vid.description || vid.topic || 'Step-by-step traditional recipe and craftsmanship lesson recorded by senior creator.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full bg-slate-900 text-white rounded-2xl h-64 flex items-center justify-center relative overflow-hidden shadow-inner">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-[#FDBC13] text-[#261900] rounded-full flex items-center justify-center mx-auto shadow-lg">
                      ▶
                    </div>
                    <div className="text-lg font-bold">Preview Video Lesson ({displaySkill})</div>
                    <div className="text-xs text-slate-400">1,240 views • Verified Elder Creator</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column (4 Cols): Guardian Shield & Stats */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-md space-y-5">
              <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-4">
                <h3 className="text-xl font-extrabold text-[#031635]">Guardian Protection</h3>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                  PROTECTED
                </span>
              </div>

              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between p-3.5 bg-[#FAF9F6] rounded-xl border border-[#E3E2E0]">
                  <span className="font-semibold text-[#44474E]">Verification Status</span>
                  <span className="font-extrabold text-emerald-700">✓ Active</span>
                </div>
                <div className="flex items-center justify-between p-3.5 bg-[#FAF9F6] rounded-xl border border-[#E3E2E0]">
                  <span className="font-semibold text-[#44474E]">Max Direct Payment</span>
                  <span className="font-extrabold text-[#031635]">₹500</span>
                </div>
                <div className="flex items-center justify-between p-3.5 bg-[#FAF9F6] rounded-xl border border-[#E3E2E0]">
                  <span className="font-semibold text-[#44474E]">Contact Privacy</span>
                  <span className="font-extrabold text-[#031635]">500m Grid Masked</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
