'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSavedProfile, getActiveUserAccount } from '@/lib/voice-agent';
import { 
  Radio, Video, VideoOff, Mic, MicOff, ArrowLeft, Sparkles, 
  Settings, Users, ShieldCheck, Play, RefreshCw, AlertCircle
} from 'lucide-react';

const CATEGORIES = [
  { id: 'cooking', label: '🍳 Cooking & Recipes', placeholder: 'Live Cooking: Grandma\'s Secret Family Recipe' },
  { id: 'gardening', label: '🪴 Gardening & Plants', placeholder: 'Garden Care: Pruning & Soil Tips' },
  { id: 'crafts', label: '🧶 Arts, Crafts & Knitting', placeholder: 'Live Knitting & Handcrafting Circle' },
  { id: 'storytelling', label: '📖 Storytelling & Memories', placeholder: 'Stories from the Past: Life Lessons & Tales' },
  { id: 'tech', label: '💻 Tech & Phone Help', placeholder: 'Live Tech Help: Smartphones & Tablets Made Easy' },
  { id: 'qa', label: '❓ Open Q&A & Chit-Chat', placeholder: 'Coffee & Chit-Chat: Ask Me Anything Live!' }
];

export default function GoLiveSetupPage() {
  const router = useRouter();

  // State
  const [profile, setProfile] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
  const [isStarting, setIsStarting] = useState(false);
  const [existingStream, setExistingStream] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Media Pre-flight
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(true);
  const [micActive, setMicActive] = useState(true);
  const [mediaPermissionDenied, setMediaPermissionDenied] = useState(false);

  // Load Profile & Check Active Streams
  useEffect(() => {
    const saved = getSavedProfile();
    const activeAccount = getActiveUserAccount();
    const creatorName = saved?.name || activeAccount || 'Senior Creator';
    const creatorId = activeAccount || 'provider-user';

    setProfile({ name: creatorName, id: creatorId });
    setTitle(`${creatorName}'s Live Workshop`);

    // Check if there is already an active stream
    fetch('/api/live-streams')
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.streams)) {
          const active = data.streams.find((s: any) => s.creator_id === creatorId || s.creator_name === creatorName);
          if (active) {
            setExistingStream(active);
          }
        }
      })
      .catch(e => console.warn('Could not check existing streams:', e));
  }, []);

  // Initialize Camera Preview
  useEffect(() => {
    let localStream: MediaStream | null = null;

    async function initMedia() {
      try {
        setMediaPermissionDenied(false);
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: true
        });
        localStream = stream;
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Camera preview permission error:', err);
        setMediaPermissionDenied(true);
      }
    }

    initMedia();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Toggle Camera
  const toggleCamera = () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !cameraActive;
        setCameraActive(!cameraActive);
      }
    }
  };

  // Toggle Mic
  const toggleMic = () => {
    if (streamRef.current) {
      const track = streamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !micActive;
        setMicActive(!micActive);
      }
    }
  };

  // Category select helper
  const handleSelectCategory = (cat: typeof CATEGORIES[0]) => {
    setSelectedCategory(cat.id);
    if (!title || CATEGORIES.some(c => c.placeholder === title) || title.includes('Live Workshop')) {
      setTitle(cat.placeholder);
    }
  };

  // Launch Live Stream
  const handleGoLive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please enter a title for your live stream');
      return;
    }

    setIsStarting(true);
    setErrorMsg('');

    const creatorId = profile?.id || 'provider-user';
    const creatorName = profile?.name || 'Senior Creator';

    try {
      const res = await fetch('/api/live-streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId,
          creatorName,
          title: title.trim(),
          description: description.trim() || `${selectedCategory.toUpperCase()} session with ${creatorName}`
        })
      });

      const data = await res.json();
      if (data.success && data.stream?.id) {
        // Stop local preview tracks so next page gets clean access
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
        }
        router.push(`/dashboard/live/${data.stream.id}`);
      } else {
        setErrorMsg(data.error || 'Failed to initialize live stream. Please try again.');
        setIsStarting(false);
      }
    } catch (err: any) {
      console.error('Error going live:', err);
      setErrorMsg('Could not connect to live stream server. Please check your connection.');
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#031635] flex flex-col font-sans pb-12">
      {/* Top Navigation */}
      <header className="bg-white border-b border-[#E3E2E0] sticky top-0 z-20 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[#031635] font-black text-sm rounded-xl transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
            <div className="h-6 w-[2px] bg-slate-200 hidden sm:block" />
            <h1 className="text-xl font-black flex items-center gap-2">
              <span className="p-2 bg-rose-100 text-rose-600 rounded-xl">🎥</span>
              Live Broadcast Studio Setup
            </h1>
          </div>

          <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1.5 rounded-full text-xs font-black">
            <Radio className="w-4 h-4 animate-pulse" /> Pre-Flight Check
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto w-full px-6 pt-8 flex-1">
        {/* Existing Active Stream Alert */}
        {existingStream && (
          <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500 text-white rounded-xl font-black">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-black text-amber-950">You have an active stream in progress!</p>
                <p className="text-xs text-amber-800 font-medium">"{existingStream.title}" is currently live and discoverable by learners.</p>
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => router.push(`/dashboard/live/${existingStream.id}`)}
                className="flex-1 sm:flex-none px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow transition"
              >
                Resume Active Stream →
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Camera Preview & Audio Devices */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#031635] rounded-3xl p-5 shadow-xl text-white relative overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-300">Live Camera Check</span>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {cameraActive ? 'Camera On' : 'Camera Muted'}
                </span>
              </div>

              {/* Video Preview Box */}
              <div className="aspect-video w-full bg-black rounded-2xl overflow-hidden relative shadow-inner flex items-center justify-center border border-white/10">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${!cameraActive || mediaPermissionDenied ? 'hidden' : 'block'}`}
                />

                {(!cameraActive || mediaPermissionDenied) && (
                  <div className="text-center p-6 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto text-3xl">
                      👵🏽
                    </div>
                    <p className="text-sm font-black text-slate-200">
                      {mediaPermissionDenied ? 'Camera Access Required' : 'Camera is Turned Off'}
                    </p>
                    <p className="text-xs text-slate-400 max-w-xs">
                      {mediaPermissionDenied 
                        ? 'Please allow camera and microphone access in your browser to broadcast.'
                        : 'Your video stream will begin when you click Start Streaming.'}
                    </p>
                  </div>
                )}

                {/* Status Badges Overlay */}
                <div className="absolute top-3 left-3 flex gap-2">
                  <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black tracking-wider uppercase backdrop-blur-md ${
                    micActive ? 'bg-emerald-600/90 text-white' : 'bg-red-600/90 text-white'
                  }`}>
                    {micActive ? 'Mic Ready' : 'Mic Off'}
                  </div>
                </div>
              </div>

              {/* Video & Mic Toggle Controls */}
              <div className="mt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs transition active:scale-95 ${
                    micActive 
                      ? 'bg-white/10 hover:bg-white/20 text-white border border-white/10' 
                      : 'bg-red-600 hover:bg-red-700 text-white shadow-lg'
                  }`}
                >
                  {micActive ? <Mic className="w-4 h-4 text-emerald-400" /> : <MicOff className="w-4 h-4" />}
                  {micActive ? 'Mute Microphone' : 'Unmute Microphone'}
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs transition active:scale-95 ${
                    cameraActive 
                      ? 'bg-white/10 hover:bg-white/20 text-white border border-white/10' 
                      : 'bg-red-600 hover:bg-red-700 text-white shadow-lg'
                  }`}
                >
                  {cameraActive ? <Video className="w-4 h-4 text-emerald-400" /> : <VideoOff className="w-4 h-4" />}
                  {cameraActive ? 'Turn Off Camera' : 'Turn On Camera'}
                </button>
              </div>
            </div>

            {/* Senior Friendly Quick Tips */}
            <div className="bg-white border-2 border-[#E3E2E0] rounded-2xl p-5 shadow-sm space-y-2">
              <h3 className="text-sm font-black text-[#031635] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" /> Best Practices for a Great Stream
              </h3>
              <ul className="text-xs text-[#44474E] font-medium space-y-1.5 list-disc list-inside">
                <li>Sit in a well-lit area with light facing your face, not behind you.</li>
                <li>Speak clearly — learners can ask questions in real-time in the live chat!</li>
                <li>You can share your screen anytime once you enter the broadcasting room.</li>
              </ul>
            </div>
          </div>

          {/* Right Column: Stream Details & Go Live Button */}
          <div className="lg:col-span-5 bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-sm space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase text-rose-600 tracking-wider">Step 2</span>
                <span className="text-xs font-bold text-slate-400">• Session Details</span>
              </div>
              <h2 className="text-xl font-black text-[#031635]">What are you sharing today?</h2>
              <p className="text-xs text-[#75777F] font-medium mt-0.5">
                Hosting as <strong className="text-[#031635]">{profile?.name || 'Senior Creator'}</strong>
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleGoLive} className="space-y-5">
              {/* Category Quick Presets */}
              <div>
                <label className="block text-xs font-black text-[#031635] mb-2 uppercase tracking-wider">
                  Select Topic
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat)}
                      className={`p-2.5 rounded-xl text-left text-xs font-black border transition ${
                        selectedCategory === cat.id
                          ? 'bg-rose-50 border-rose-500 text-rose-900 shadow-sm'
                          : 'bg-[#FAF9F6] border-[#E3E2E0] text-[#031635] hover:bg-slate-50'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stream Title */}
              <div>
                <label htmlFor="stream-title" className="block text-xs font-black text-[#031635] mb-1.5 uppercase tracking-wider">
                  Stream Title *
                </label>
                <input
                  id="stream-title"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Grandma's Secret Sourdough Workshop"
                  required
                  className="w-full px-4 py-3 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl text-sm font-black text-[#031635] placeholder:text-slate-400 focus:border-rose-500 focus:outline-none transition"
                />
              </div>

              {/* Stream Description */}
              <div>
                <label htmlFor="stream-desc" className="block text-xs font-black text-[#031635] mb-1.5 uppercase tracking-wider">
                  Short Description (Optional)
                </label>
                <textarea
                  id="stream-desc"
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Tell your viewers what they'll learn or see during this session..."
                  className="w-full px-4 py-3 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl text-xs font-bold text-[#031635] placeholder:text-slate-400 focus:border-rose-500 focus:outline-none transition resize-none"
                />
              </div>

              {/* Big Senior-Friendly Go Live Button */}
              <button
                type="submit"
                disabled={isStarting}
                className="w-full py-4 px-6 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-black text-lg rounded-2xl shadow-lg transition transform active:scale-98 flex items-center justify-center gap-3 disabled:opacity-50 cursor-pointer"
              >
                {isStarting ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Launching Stream Studio...
                  </>
                ) : (
                  <>
                    <Radio className="w-6 h-6 animate-pulse" />
                    🔴 Go Live Now
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
