'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSavedProfile, ProfileState, voiceAgent, setActiveUserAccount, getActiveUserAccount, getSavedSecurityCredentials } from '@/lib/voice-agent';
import { 
  ShieldCheck, Mic, CheckCircle2, Star, MapPin, Languages, 
  ChefHat, Award, ArrowRight, Edit3, ArrowLeft, LogOut, Trash2
} from 'lucide-react';

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryUsername = searchParams ? searchParams.get('username') : null;
  const [isOwnProfile, setIsOwnProfile] = useState(true);

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
    const isOwn = !queryUsername || (activeName && queryUsername.toLowerCase() === activeName.toLowerCase());
    setIsOwnProfile(!!isOwn);

    // If it's the user's own profile, but they are not logged in, redirect them to login/home
    if (isOwn && !activeName) {
      const loaded = getSavedProfile(undefined);
      if (!loaded || !loaded.name) {
        router.push('/');
        return;
      }
      setProfile(loaded);
    }

    if (isOwn && activeName) {
      const loaded = getSavedProfile(activeName);
      if (loaded && loaded.name) {
        setProfile(loaded);
      }
      const sec = getSavedSecurityCredentials(activeName);
      if (sec && sec.face && sec.face.photoUrl) {
        setUserFacePhoto(sec.face.photoUrl);
      }
    }

    const currentName = isOwn ? (activeName || '') : (queryUsername || '');

    if (currentName) {
      // Fetch details from sync API
      fetch('/api/users/sync')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.accounts && data.accounts.length > 0) {
            const userAcc = data.accounts.find((a: any) => 
              (a.user_name || '').toLowerCase() === currentName.toLowerCase()
            );

            if (userAcc) {
              setProfile({
                name: userAcc.user_name,
                skill: userAcc.skill,
                experience_years: userAcc.experience_years !== null && userAcc.experience_years !== undefined ? Number(userAcc.experience_years) : null,
                location: userAcc.location,
                language: userAcc.language || 'English',
                services: (userAcc.services && userAcc.services !== '[]') 
                  ? (typeof userAcc.services === 'string' ? JSON.parse(userAcc.services) : userAcc.services) 
                  : [],
                availability: userAcc.availability || null
              });

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
          let apiVids: any[] = [];
          if (data.success && data.videos) {
            apiVids = data.videos.map((v: any) => ({
              id: v.id,
              topic: v.topic,
              description: v.description,
              recordedAt: new Date(v.recorded_at).toLocaleDateString(),
              videoUrl: v.video_data || v.video_url,
              isPublic: v.is_public !== undefined ? v.is_public : true
            }));
          }

          let localVids: any[] = [];
          if (isOwn && typeof window !== 'undefined') {
            const saved = JSON.parse(localStorage.getItem('silverhands_recorded_videos') || '[]');
            localVids = saved.filter((v: any) => !v.creatorName || (v.creatorName || '').toLowerCase() === currentName.toLowerCase());
          }

          // Merge by ID to prevent duplicates, showing the latest first
          const merged = [...apiVids];
          localVids.forEach((lv: any) => {
            if (!merged.some((av: any) => av.id === lv.id)) {
              merged.push({
                id: lv.id,
                topic: lv.topic,
                description: lv.description,
                recordedAt: lv.recordedAt ? new Date(lv.recordedAt).toLocaleDateString() : new Date().toLocaleDateString(),
                videoUrl: lv.videoUrl,
                isPublic: lv.is_public !== undefined ? lv.is_public : true
              });
            }
          });

          setRecordedVideos(merged);
        })
        .catch(() => {
          if (isOwn && typeof window !== 'undefined') {
            const saved = JSON.parse(localStorage.getItem('silverhands_recorded_videos') || '[]');
            const userVids = saved.filter((v: any) => !v.creatorName || (v.creatorName || '').toLowerCase() === currentName.toLowerCase());
            setRecordedVideos(userVids);
          }
        });
    }
  }, [queryUsername]);

  const handleDeleteVideo = async (id: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    try {
      const res = await fetch(`/api/videos?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setRecordedVideos(prev => prev.filter(v => v.id !== id));
        if (typeof window !== 'undefined') {
          const saved = JSON.parse(localStorage.getItem('silverhands_recorded_videos') || '[]');
          const filtered = saved.filter((v: any) => v.id !== id);
          localStorage.setItem('silverhands_recorded_videos', JSON.stringify(filtered));
        }
      } else {
        alert("Failed to delete video: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error('Failed to delete video:', err);
      alert("Error deleting video. Is the server running?");
    }
  };

  const clearOldVideos = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('silverhands_recorded_videos');
    }
    setRecordedVideos([]);
    alert("Old video cache cleared! Now record a new video in Video Studio to generate your dynamic AI description.");
  };

  const displayName = profile.name || 'Not provided yet';
  const publicVideos = recordedVideos.filter(v => v.isPublic);
  const privateVideos = recordedVideos.filter(v => !v.isPublic);
  const displaySkills = Array.isArray(profile.skills) && profile.skills.length > 0
    ? profile.skills
    : (profile.skill ? [{ name: profile.skill, type: 'primary' as const, experience_years: profile.experience_years ?? null }] : []);
  const displaySkill = displaySkills.length > 0 ? displaySkills.map((s: any) => s.name).join(', ') : (profile.skill || 'Not provided yet');
  const displayExperience = profile.experience_years !== null && profile.experience_years !== undefined 
    ? (profile.experience_years === 0 ? '0 Years Experience' : `${profile.experience_years} Years Experience`) 
    : (displaySkills[0]?.experience_years !== null && displaySkills[0]?.experience_years !== undefined ? `${displaySkills[0].experience_years} Years Experience` : 'Not provided yet');
  const displayLocation = profile.location || 'Not provided yet';
  const displayLanguage = profile.language || 'English';
  const displayServices = Array.isArray(profile.services) ? profile.services : [];

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
              <Link href="/providers" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Search Providers
              </Link>
              <Link href="/profile" className={`px-5 py-2 rounded-full text-sm transition ${isOwnProfile ? 'bg-[#031635] text-white font-bold shadow-sm' : 'text-[#44474E] hover:text-[#031635] font-semibold'}`}>
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
            {isOwnProfile && (
              <button
                onClick={() => {
                  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
                  setActiveUserAccount('');
                  voiceAgent.resetState();
                  router.push('/');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-sm font-bold transition shadow-sm"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            )}
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

            {isOwnProfile && (
              <div className="shrink-0 flex flex-col gap-3 w-full md:w-auto">
                <button
                  onClick={() => router.push('/provider?edit=true')}
                  className="px-6 py-3.5 bg-[#FDBC13] text-[#261900] font-bold rounded-2xl shadow-md hover:bg-[#F3B20B] transition flex items-center justify-center gap-2"
                >
                  <Mic className="w-5 h-5" /> Edit Profile with Voice
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 2-Column Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column (8 Cols): Skills, Offerings & Biography */}
          <div className="lg:col-span-8 space-y-6">
            {/* Dynamic Skills Grid (Supports 1, 2, 5, 10+ skills) */}
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-8 shadow-md space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-extrabold text-[#031635] flex items-center gap-2">
                  <Award className="w-6 h-6 text-[#FDBC13]" /> Master Skills &amp; Craftsmanship
                </h2>
                <span className="text-xs font-bold bg-[#2D5A27]/10 text-[#2D5A27] px-3 py-1 rounded-full border border-[#2D5A27]/30">
                  {displaySkills.length} {displaySkills.length === 1 ? 'Skill Verified' : 'Skills Verified'}
                </span>
              </div>

              {displaySkills.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displaySkills.map((sk: any, idx: number) => {
                    const name = typeof sk === 'string' ? sk : (sk.name || 'Skill');
                    const type = typeof sk === 'object' ? sk.type : (idx === 0 ? 'primary' : 'additional');
                    const exp = typeof sk === 'object' ? sk.experience_years : null;
                    return (
                      <div key={idx} className="bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl p-5 space-y-2 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            type === 'primary' ? 'bg-[#FDBC13] text-[#261900]' : 'bg-[#E3E2E0] text-[#44474E]'
                          }`}>
                            {type === 'primary' ? 'Primary Skill' : 'Additional Skill'}
                          </span>
                          <CheckCircle2 className="w-4 h-4 text-[#2D5A27]" />
                        </div>
                        <div className="text-xl font-extrabold text-[#031635]">{name}</div>
                        <div className="text-sm font-semibold text-[#44474E]">
                          {exp !== null && exp !== undefined ? (exp === 0 ? 'Starting out (0 years)' : `${exp} Years of Experience`) : 'Experience not specified'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 bg-[#FAF9F6] border border-dashed border-[#C5C6CF] rounded-2xl text-center text-[#75777F] text-sm">
                  No skills listed yet. Click &quot;Edit Profile with Voice&quot; to speak your skills.
                </div>
              )}
            </div>

            {/* Service Offerings */}
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-8 shadow-md space-y-6">
              <h2 className="text-2xl font-extrabold text-[#031635]">Service Offerings &amp; Classes</h2>
              <p className="text-[#44474E] text-base leading-relaxed">
                {displayServices.length > 0 
                  ? `These creator offerings were confirmed for your expertise.`
                  : `No additional service offerings specified yet.`}
              </p>

              {displayServices.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {displayServices.map((srv: any, idx: number) => {
                    const label = typeof srv === 'string' ? srv : (srv?.name || `Service #${idx + 1}`);
                    return (
                      <div key={idx} className="bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl p-5 space-y-2 shadow-sm">
                        <div className="w-10 h-10 bg-[#D8E2FF] text-[#031635] rounded-xl flex items-center justify-center font-bold">
                          #{idx + 1}
                        </div>
                        <div className="text-lg font-extrabold text-[#031635]">{label}</div>
                        <div className="text-xs text-[#75777F]">Available for online &amp; local bookings</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 bg-[#FAF9F6] border border-dashed border-[#C5C6CF] rounded-2xl text-center text-[#75777F] text-sm">
                  Will be derived from confirmed skills or added when you create listings.
                </div>
              )}
            </div>

            {/* Video Showcase Widget */}
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-8 shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-4">
                <div>
                  <h2 className="text-2xl font-extrabold text-[#031635]">Featured Video Lessons</h2>
                  <p className="text-xs text-[#75777F] mt-1">Publicly posted shorts visible on your profile.</p>
                </div>
                <div className="flex items-center gap-2">
                  {isOwnProfile && (
                    <button
                      onClick={() => router.push('/video/create')}
                      className="text-sm font-bold text-[#031635] hover:underline flex items-center gap-1 bg-[#D8E2FF] px-4 py-2 rounded-full border border-[#031635]/20 shadow-sm"
                    >
                      <Edit3 className="w-4 h-4" /> Record New Video
                    </button>
                  )}
                </div>
              </div>

              {/* Public posted videos (Shorts) */}
              {publicVideos.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {publicVideos.map((vid, idx) => (
                    <div key={idx} className="space-y-3 bg-[#FAF9F6] border border-[#E3E2E0] p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="bg-[#2D5A27]/10 text-[#2D5A27] text-xs font-bold px-3 py-1 rounded-full border border-[#2D5A27]/30 flex items-center gap-1">
                            🌐 Public Lesson (AI Short)
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#75777F]">{vid.recordedAt}</span>
                            {isOwnProfile && (
                              <button
                                onClick={() => handleDeleteVideo(vid.id)}
                                className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-50 rounded-lg transition"
                                title="Delete Video"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <div className="w-full max-w-[280px] bg-slate-900 rounded-2xl overflow-hidden border-2 border-[#031635] shadow-lg relative" style={{ aspectRatio: '9/16' }}>
                            <video src={vid.videoUrl} controls className="w-full h-full object-cover" />
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 pt-2">
                        <h3 className="font-extrabold text-[#031635] text-lg leading-snug">&quot;{vid.topic || 'Senior Lesson Video'}&quot;</h3>
                        <p className="text-sm text-[#44474E] leading-relaxed">
                          ✨ <span className="font-extrabold text-[#031635]">AI Description:</span> {vid.description || 'Step-by-step traditional recipe and craftsmanship lesson recorded by senior creator.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="w-full bg-[#FAF9F6] border-2 border-dashed border-[#E3E2E0] rounded-2xl h-64 flex items-center justify-center relative overflow-hidden">
                  <div className="text-center space-y-2 max-w-sm px-4">
                    <div className="w-16 h-16 bg-[#D8E2FF] text-[#031635] rounded-full flex items-center justify-center mx-auto shadow-sm text-2xl">
                      🎥
                    </div>
                    <div className="text-lg font-extrabold text-[#031635]">Video Lessons Showcase</div>
                    <div className="text-xs text-[#75777F]">
                      {isOwnProfile 
                        ? "No public shorts posted yet. Record and save a lesson in Video Studio to showcase your craft!"
                        : "No public video lessons are showcased on this profile yet."}
                    </div>
                  </div>
                </div>
              )}

              {/* Private saved videos (Full-length raw recordings) - Only visible to owner */}
              {isOwnProfile && privateVideos.length > 0 && (
                <div className="pt-6 border-t border-[#E3E2E0] space-y-4">
                  <div>
                    <h3 className="text-xl font-extrabold text-[#031635] flex items-center gap-2">
                      🔒 Private Video Vault
                    </h3>
                    <p className="text-xs text-[#75777F] mt-0.5">Full-length raw recordings. Only you can view these saved files.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {privateVideos.map((vid, idx) => (
                      <div key={idx} className="bg-[#FAF9F6] border border-[#E3E2E0] p-4 rounded-2xl shadow-sm space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="bg-amber-600/10 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-600/30 flex items-center gap-1">
                            🔒 Saved (Full Video)
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold text-[#75777F]">{vid.recordedAt}</span>
                            <button
                              onClick={() => handleDeleteVideo(vid.id)}
                              className="text-rose-600 hover:text-rose-800 p-1 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Video"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="w-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-sm relative" style={{ aspectRatio: '16/9' }}>
                          <video src={vid.videoUrl} controls className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <h4 className="font-bold text-[#031635] text-sm truncate">{vid.topic || 'Saved Raw Video'}</h4>
                          <p className="text-xs text-[#75777F] mt-1 line-clamp-2">{vid.description || 'Raw source video before AI compilation.'}</p>
                        </div>
                      </div>
                    ))}
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

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] text-xl font-bold">Loading Profile...</div>}>
      <ProfilePageContent />
    </Suspense>
  );
}
