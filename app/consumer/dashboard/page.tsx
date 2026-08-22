'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  getSavedConsumerUser, logoutConsumer, ConsumerUser, 
  fetchLiveConsumerProducts, fetchLiveConsumerListings, fetchLiveConsumerVideos, fetchLiveConsumerProviders, getRegisteredProvidersFromStorage,
  SeniorProduct, LiveSession, ServiceProvider, FreeLiveSession, ProviderVideo 
} from '@/lib/consumer-store';
import { 
  Search, ShoppingBag, Video, Sparkles, Star, MapPin, 
  CheckCircle2, Clock, Calendar, UserCheck, MessageSquare, Send, X, ArrowRight, ShieldCheck, LogOut, User, Play, Gift, Eye, Heart, Bell 
} from 'lucide-react';
import { useRealtimeLocation } from '@/lib/hooks/useRealtimeLocation';
import { useDeviceLocation } from '@/lib/hooks/useDeviceLocation';

export default function ConsumerDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<ConsumerUser | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [providerSearchQuery, setProviderSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const [products, setProducts] = useState<SeniorProduct[]>([]);
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [freeSessions, setFreeSessions] = useState<FreeLiveSession[]>([]);
  const [videos, setVideos] = useState<ProviderVideo[]>([]);

  // Modal / Checkout / Player State
  const [selectedProduct, setSelectedProduct] = useState<SeniorProduct | null>(null);
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);
  const [activeFreeSession, setActiveFreeSession] = useState<FreeLiveSession | null>(null);
  const [activeVideo, setActiveVideo] = useState<ProviderVideo | null>(null);
  const [videoComments, setVideoComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [videoLikes, setVideoLikes] = useState<number>(0);
  const [videoViews, setVideoViews] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [purchaseSuccessMsg, setPurchaseSuccessMsg] = useState<string | null>(null);

  // Active Realtime Booking Tracker
  const [activeBookingTracker, setActiveBookingTracker] = useState<{
    id: string;
    serviceName: string;
    providerName: string;
    slot: string;
    price: number;
    status: 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  } | null>(null);

  // Device GPS & Realtime Transport
  const { coordinates } = useDeviceLocation(true);
  const {
    sentRequests,
    sendServiceRequest,
  } = useRealtimeLocation({
    coordinates,
    sharingEnabled: true,
    radiusMeters: 5000,
  });

  // Sync real-time updates for the active booking
  useEffect(() => {
    if (activeBookingTracker) {
      const match = sentRequests.find((r) => r.id === activeBookingTracker.id);
      if (match && match.status !== activeBookingTracker.status) {
        setActiveBookingTracker((prev) =>
          prev ? { ...prev, status: match.status as 'REQUESTED' | 'ACCEPTED' | 'REJECTED' } : null
        );
      }
    }
  }, [sentRequests, activeBookingTracker]);

  // AI Matchmaker Chat State
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatInput, setAiChatInput] = useState('');
  const [aiMessages, setAiMessages] = useState<Array<{
    role: 'user' | 'assistant';
    text: string;
    products?: SeniorProduct[];
    sessions?: LiveSession[];
    videos?: ProviderVideo[];
  }>>([
    {
      role: 'assistant',
      text: 'Hello! I am your SilverHands AI Matchmaker. Search for any products, classes, lessons, or service providers and I will find them for you!'
    }
  ]);
  const [isAiThinking, setIsAiThinking] = useState(false);

  const loadAllConsumerData = async () => {
    try {
      const [prods, lists, vids, regProviders] = await Promise.all([
        fetchLiveConsumerProducts(),
        fetchLiveConsumerListings(),
        fetchLiveConsumerVideos(),
        fetchLiveConsumerProviders()
      ]);

      setProducts(prods);
      setSessions(lists);
      setVideos(vids);
      setProviders(regProviders);

      // Fetch live streams from PostgreSQL
      const streamRes = await fetch('/api/live-streams');
      const streamData = await streamRes.json();
      if (streamData.success && Array.isArray(streamData.streams)) {
        setFreeSessions(streamData.streams.map((s: any) => ({
          id: s.id,
          title: s.title,
          description: `Interact live with ${s.creator_name} on Google Meet! Click Join to enter the session.`,
          category: 'cooking',
          creator_name: s.creator_name,
          creator_avatar: '👵🏽',
          creator_location: 'India',
          start_time: 'LIVE NOW',
          attendees_count: s.viewer_count,
          banner_color: 'bg-emerald-500',
          meet_url: s.meet_url
        })));
      }
    } catch (e) {
      console.warn('[ConsumerDashboard] Error loading live provider data:', e);
    }
  };

  const handleJoinStream = async (stream: any) => {
    try {
      await fetch('/api/live-streams/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId: stream.id })
      });
    } catch (e) {
      console.warn('[Join stream counter error]:', e);
    }
    router.push(`/consumer/live/${stream.id}`);
  };

  const handlePlayVideo = async (v: ProviderVideo) => {
    setActiveVideo(v);
    setVideoLikes(v.likes_count || 0);
    setVideoViews((v.views_count || 0) + 1);
    setVideoComments([]);
    setNewCommentText('');

    // Update views counter in database
    try {
      fetch('/api/videos/view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: v.id })
      });
    } catch (e) {
      console.warn('[View increment error]:', e);
    }

    // Fetch video comments from database
    try {
      const res = await fetch(`/api/videos/comments?videoId=${v.id}`);
      const cData = await res.json();
      if (cData.success) {
        setVideoComments(cData.comments);
      }
    } catch (e) {
      console.warn('[Comments fetch error]:', e);
    }
  };

  const handleLikeVideo = async () => {
    if (!activeVideo) return;
    setVideoLikes(prev => prev + 1);
    try {
      await fetch('/api/videos/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: activeVideo.id })
      });
    } catch (e) {
      console.warn('[Like increment error]:', e);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVideo || !newCommentText.trim()) return;
    const activeUser = getSavedConsumerUser();
    const userName = activeUser?.username || 'Senior Learner';
    const text = newCommentText;
    setNewCommentText('');

    try {
      const res = await fetch('/api/videos/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: activeVideo.id, userName, comment: text })
      });
      const data = await res.json();
      if (data.success) {
        setVideoComments(prev => [...prev, data.comment]);
      }
    } catch (e) {
      console.warn('[Comment add error]:', e);
    }
  };

  useEffect(() => {
    const saved = getSavedConsumerUser();
    if (!saved) {
      setUser({
        id: 'usr-demo',
        email: 'learner@silverhands.in',
        username: 'Aarav Mehta',
        location: 'Chennai',
        interests: ['Pottery', 'Cooking'],
        created_at: new Date().toISOString()
      });
    } else {
      setUser(saved);
    }

    loadAllConsumerData();
    const interval = setInterval(() => {
      if (!searchQuery && activeCategory === 'all') {
        loadAllConsumerData();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [searchQuery, activeCategory]);

  const effectiveQuery = (providerSearchQuery || searchQuery || '').toLowerCase().trim();
  const filteredProviders = providers.filter(p => {
    if (!effectiveQuery) return true;
    return (
      p.name.toLowerCase().includes(effectiveQuery) ||
      p.skill.toLowerCase().includes(effectiveQuery) ||
      p.category.toLowerCase().includes(effectiveQuery) ||
      p.location.toLowerCase().includes(effectiveQuery)
    );
  });

  const handleGlobalSearch = async (query: string, category: string = 'all') => {
    setSearchQuery(query);
    setActiveCategory(category);

    const allProds = await fetchLiveConsumerProducts();
    const allSess = await fetchLiveConsumerListings();
    const allVids = await fetchLiveConsumerVideos();

    if (!query && category === 'all') {
      setProducts(allProds);
      setSessions(allSess);
      setVideos(allVids);
      return;
    }

    const q = (query || '').toLowerCase().trim();
    const cat = (category || 'all').toLowerCase();

    let matchedP = allProds.filter(p => {
      const matchCat = cat === 'all' || p.category.toLowerCase().includes(cat) || cat.includes(p.category.toLowerCase());
      const matchQuery = !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.creator_name.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });

    // If filtering by category returned no products, show all products matching search query
    if (matchedP.length === 0 && cat !== 'all') {
      matchedP = allProds.filter(p => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }

    let matchedS = allSess.filter(s => {
      const matchCat = cat === 'all' || s.category.toLowerCase().includes(cat) || cat.includes(s.category.toLowerCase());
      const matchQuery = !q || s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.creator_name.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });

    if (matchedS.length === 0 && cat !== 'all') {
      matchedS = allSess;
    }

    let matchedV = allVids.filter(v => {
      const matchQuery = !q || v.title.toLowerCase().includes(q) || v.description.toLowerCase().includes(q) || v.creator_name.toLowerCase().includes(q);
      return matchQuery;
    });

    setProducts(matchedP);
    setSessions(matchedS);
    setVideos(matchedV);
  };

  const handleAiSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiChatInput.trim() || isAiThinking) return;

    const userText = aiChatInput.trim();
    setAiChatInput('');
    setAiMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsAiThinking(true);

    try {
      const res = await fetch('/api/ai/consumer-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userText })
      });
      const data = await res.json();

      if (data.success) {
        setAiMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: data.ai_explanation || `Here are the top results for "${userText}":`,
            products: data.matched_products,
            sessions: data.matched_sessions,
            videos: data.matched_videos
          }
        ]);
        if (data.matched_products) setProducts(data.matched_products);
        if (data.matched_sessions) setSessions(data.matched_sessions);
        if (data.matched_videos) setVideos(data.matched_videos);
      }
    } catch (e) {
      const q = userText.toLowerCase();
      setAiMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `Here are matching results for "${userText}":`,
          products: products.filter((p: SeniorProduct) => p.title.toLowerCase().includes(q)),
          sessions: sessions.filter((s: LiveSession) => s.title.toLowerCase().includes(q)),
          videos: videos.filter((v: ProviderVideo) => v.title.toLowerCase().includes(q) || v.tags.some((t: string) => t.includes(q)))
        }
      ]);
    } finally {
      setIsAiThinking(false);
    }
  };

  const executeProductPurchase = (product: SeniorProduct) => {
    setPurchaseSuccessMsg(`🎉 Success! You ordered "${product.title}" from service provider ${product.creator_name}.`);
    setSelectedProduct(null);
    setTimeout(() => setPurchaseSuccessMsg(null), 5000);
  };

  const executeSessionBooking = (
    sessionTitle: string,
    providerName: string,
    slot: string,
    price: number,
    targetProviderId?: string
  ) => {
    if (!slot) {
      alert('Please select an available time slot for your paid 1-on-1 appointment!');
      return;
    }

    const pId = targetProviderId || selectedProvider?.id || 'usr_prov_lakshmi_ammal';
    const reqId = sendServiceRequest({
      providerId: pId,
      serviceName: sessionTitle,
      preferredTime: slot,
      message: `Paid 1-on-1 appointment for ${sessionTitle} on ${slot} (Fee: ₹${price})`,
    });

    // Also dispatch HTTP create for cross-browser redundancy
    const backendBase = process.env.NEXT_PUBLIC_API_BACKEND_URL || 'http://localhost:8000';
    try {
      fetch(`${backendBase}/api/requests/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: reqId,
          consumerId: user?.id || 'usr_consumer_aarav',
          consumerName: user?.username || 'Aarav Mehta',
          providerId: pId,
          serviceName: sessionTitle,
          preferredTime: slot,
          message: `Paid 1-on-1 appointment for ${sessionTitle} on ${slot} (Fee: ₹${price})`,
        }),
      }).catch(() => {});
    } catch (e) {}

    setActiveBookingTracker({
      id: reqId,
      serviceName: sessionTitle,
      providerName,
      slot,
      price,
      status: 'REQUESTED',
    });

    setSelectedSession(null);
    setSelectedProvider(null);
    setSelectedSlot('');
  };

  return (
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col antialiased pb-20">
      {/* Top Consumer Navbar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                🤝
              </div>
              <div>
                <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
                <span className="text-xs font-bold text-[#FDBC13] uppercase tracking-widest block -mt-1 bg-[#031635] px-2 py-0.5 rounded-full text-center">
                  Learner & Buyer Portal
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 bg-[#F4F3F1] px-4 py-2 rounded-2xl border border-[#E3E2E0] w-72">
                <Search className="w-4 h-4 text-[#44474E]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleGlobalSearch(e.target.value, activeCategory)}
                  placeholder="Search biryani, pottery, cooking..."
                  className="bg-transparent border-none text-sm font-semibold text-[#031635] focus:outline-none w-full"
                />
              </div>
              <button
                onClick={() => router.push('/providers')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl text-xs font-extrabold shadow-sm transition whitespace-nowrap"
              >
                📋 Orders & Demands
              </button>
              <Link
                href="/nearby?role=consumer"
                className="px-4 py-2 bg-[#031635] hover:bg-[#08295e] text-[#FDBC13] rounded-2xl text-xs font-extrabold shadow-sm transition whitespace-nowrap flex items-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5" /> 📍 Live Radar
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsAiChatOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#FDBC13] hover:bg-[#e0a50b] text-[#031635] rounded-2xl text-sm font-extrabold shadow-sm transition"
            >
              <Sparkles className="w-4 h-4" /> AI Matchmaker
            </button>

            <div className="hidden sm:flex items-center gap-3 px-3.5 py-1.5 bg-[#F4F3F1] rounded-2xl border border-[#E3E2E0]">
              <div className="w-8 h-8 rounded-full bg-[#031635] text-white flex items-center justify-center font-black text-xs">
                {user?.username?.charAt(0) || 'U'}
              </div>
              <div className="text-left">
                <span className="text-xs font-extrabold text-[#031635] block leading-tight">{user?.username || 'Consumer'}</span>
                <span className="text-[10px] font-bold text-[#44474E] block">{user?.location || 'India'}</span>
              </div>
            </div>

            <button
              onClick={() => {
                logoutConsumer();
                router.push('/consumer/login');
              }}
              className="p-2 text-[#44474E] hover:text-red-600 rounded-xl hover:bg-red-50 transition"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Success Notification Banner */}
      {purchaseSuccessMsg && (
        <div className="bg-[#031635] text-[#FDBC13] px-6 py-3.5 text-center text-sm font-extrabold shadow-md animate-fade-in flex items-center justify-center gap-2 sticky top-20 z-30">
          <CheckCircle2 className="w-5 h-5 text-[#FDBC13]" /> {purchaseSuccessMsg}
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-screen-2xl mx-auto px-6 lg:px-12 pt-8 flex-1 w-full space-y-14">

        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-[#031635] to-[#0A2E66] rounded-3xl p-8 lg:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[#FDBC13] font-extrabold text-xs tracking-wider uppercase mb-4 border border-white/20">
              <Sparkles className="w-3.5 h-3.5" /> Free Live Community Sessions & 1-on-1 Appointments
            </span>
            <h1 className="text-3xl lg:text-5xl font-black text-white tracking-tight leading-tight">
              Watch Free Live Masterclasses & Book Paid 1-on-1 Appointments
            </h1>
            <p className="mt-4 text-slate-300 text-sm lg:text-base font-medium">
              Join free live workshops, search provider videos (e.g. Dum Biryani, Terracotta Pottery), or book paid 1-on-1 video consultations.
            </p>
            {/* Hero buttons removed */}
          </div>
        </div>

        {/* AREA 1: FREE COMMUNITY LIVE SESSIONS (OPEN FOR ALL CONSUMERS) */}
        <section id="free-sessions" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs uppercase tracking-wider inline-block mb-2 border border-emerald-200">
                100% Free for All Consumers
              </span>
              <h2 className="text-3xl font-black text-[#031635] tracking-tight flex items-center gap-2">
                <Gift className="w-7 h-7 text-emerald-600" /> Free Community Live Sessions & Workshops
              </h2>
              <p className="text-sm font-semibold text-[#44474E]">
                Open live video streams hosted by senior masters. Free to watch and participate for every consumer.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {freeSessions.map(fs => (
              <div key={fs.id} className="bg-white rounded-3xl border-2 border-emerald-500/20 p-6 shadow-md hover:shadow-xl transition flex flex-col justify-between group relative overflow-hidden">
                <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-600 text-white font-extrabold text-[11px] rounded-bl-2xl">
                  FREE STREAM
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3 mt-1 text-emerald-700 font-extrabold text-xs">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" /> {fs.start_time}
                  </div>

                  <h3 className="text-lg font-black text-[#031635] leading-snug mb-2 group-hover:text-emerald-700 transition">
                    {fs.title}
                  </h3>
                  <p className="text-xs font-semibold text-[#44474E] line-clamp-2 mb-4">
                    {fs.description}
                  </p>

                  <div className="bg-[#FAF9F6] p-3 rounded-2xl border border-[#E3E2E0] mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{fs.creator_avatar}</span>
                      <div>
                        <span className="font-extrabold text-xs text-[#031635] block">{fs.creator_name}</span>
                        <span className="text-[10px] font-bold text-[#44474E] block">{fs.creator_location}</span>
                      </div>
                    </div>
                    <span className="text-xs font-extrabold text-slate-500">{fs.attendees_count} watching</span>
                  </div>
                </div>

                <button
                  onClick={() => handleJoinStream(fs)}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-white" /> Join Free Live Stream Now
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* AREA 2: POSTED PROVIDER VIDEO TUTORIALS & RECIPES (BIRYANI, POTTERY, COOKING) */}
        <section id="provider-videos" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-extrabold text-xs uppercase tracking-wider inline-block mb-2 border border-purple-200">
                Posted Provider Video Library
              </span>
              <h2 className="text-3xl font-black text-[#031635] tracking-tight flex items-center gap-2">
                <Video className="w-7 h-7 text-purple-600" /> Service Provider Posted Videos & Recipes
              </h2>
              <p className="text-sm font-semibold text-[#44474E]">
                Watch recorded video tutorials and skill masterclasses.
              </p>
            </div>
          </div>

          {videos.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-[#E3E2E0] p-8 text-center space-y-2">
              <Video className="w-10 h-10 text-purple-400 mx-auto" />
              <h3 className="text-base font-extrabold text-[#031635]">No Recorded Lessons or Recipes Posted Yet</h3>
              <p className="text-xs text-[#44474E] font-medium">When service providers record or post video tutorials, they will appear right here!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {videos.map(video => (
                <div key={video.id} className="bg-white rounded-3xl border border-[#E3E2E0] overflow-hidden shadow-md hover:shadow-xl transition flex flex-col justify-between group">
                  <div>
                    <div className="relative h-48 w-full bg-slate-900 overflow-hidden cursor-pointer" onClick={() => handlePlayVideo(video)}>
                      <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 opacity-90" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/10 transition">
                        <div className="w-12 h-12 rounded-full bg-white/90 text-[#031635] flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Play className="w-6 h-6 fill-[#031635] ml-1" />
                        </div>
                      </div>
                      <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-black/80 text-white font-extrabold text-xs backdrop-blur-md">
                        {video.video_duration}
                      </span>
                    </div>

                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs font-extrabold text-[#44474E] mb-2">
                        <span>{video.creator_avatar}</span>
                        <span>{video.creator_name}</span>
                        <span>•</span>
                        <span className="flex items-center text-slate-500 font-bold">
                          <Eye className="w-3.5 h-3.5 mr-1" /> {video.views_count} views
                        </span>
                      </div>

                      <h3 className="text-base font-black text-[#031635] leading-snug mb-2 group-hover:text-purple-700 transition">
                        {video.title}
                      </h3>
                      <p className="text-xs font-semibold text-[#44474E] line-clamp-2 mb-3">
                        {video.description}
                      </p>

                      <div className="flex flex-wrap gap-1">
                        {video.tags.slice(0, 3).map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded-md bg-[#FAF9F6] text-[#44474E] text-[10px] font-bold border border-[#E3E2E0]">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 pt-0">
                    <button
                      onClick={() => handlePlayVideo(video)}
                      className="w-full py-2.5 bg-[#031635] hover:bg-[#062454] text-white font-extrabold text-xs rounded-2xl shadow-sm transition flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-white" /> Watch Posted Video Tutorial
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 1 (TOP PRIORITIZED): PAID 1-ON-1 LIVE SESSIONS & APPOINTMENTS */}
        <section id="live-sessions" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 font-extrabold text-xs uppercase tracking-wider inline-block mb-2 border border-red-200">
                1st Column / Paid Appointments
              </span>
              <h2 className="text-3xl font-black text-[#031635] tracking-tight flex items-center gap-2">
                <Video className="w-7 h-7 text-red-500" /> Paid 1-on-1 Live Sessions & Appointments
              </h2>
              <p className="text-sm font-semibold text-[#44474E]">
                Book a paid 1-on-1 live appointment directly with a service provider for personalized masterclasses.
              </p>
            </div>
          </div>

          {sessions.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-[#E3E2E0] p-8 text-center space-y-2">
              <Calendar className="w-10 h-10 text-red-400 mx-auto" />
              <h3 className="text-base font-extrabold text-[#031635]">No Paid Live Sessions Posted Yet</h3>
              <p className="text-xs text-[#44474E] font-medium">When service providers offer live 1-on-1 appointments, they will appear here!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sessions.map(session => (
                <div key={session.id} className="bg-white rounded-3xl border-2 border-[#031635]/15 p-6 shadow-md hover:shadow-xl transition flex flex-col justify-between group relative overflow-hidden">
                  <div className="absolute top-0 right-0 px-3 py-1 bg-red-600 text-white font-extrabold text-[11px] rounded-bl-2xl">
                    Paid 1-on-1 Appointment
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3 mt-2">
                      <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 font-extrabold text-xs flex items-center gap-1 border border-red-200">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" /> {session.session_type} Video Call
                      </span>
                      <div className="flex items-center gap-1 text-amber-500 font-extrabold text-xs">
                        <Star className="w-4 h-4 fill-amber-500" /> {session.rating}
                      </div>
                    </div>

                    <h3 className="text-lg font-black text-[#031635] leading-snug mb-2 group-hover:text-blue-700 transition">
                      {session.title}
                    </h3>
                    <p className="text-xs font-semibold text-[#44474E] line-clamp-2 mb-4">
                      {session.description}
                    </p>

                    <div className="bg-[#FAF9F6] p-3.5 rounded-2xl border border-[#E3E2E0] mb-4 flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#031635] text-white flex items-center justify-center text-2xl font-bold">
                        {session.creator_avatar}
                      </div>
                      <div>
                        <span className="font-extrabold text-sm text-[#031635] block">{session.creator_name}</span>
                        <span className="text-[11px] font-bold text-[#44474E] block">{session.creator_experience}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-4 border-t border-[#E3E2E0] pt-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#44474E]">
                        <Clock className="w-4 h-4" /> {session.duration_mins} Mins Duration
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] text-[#44474E] block font-bold">Appointment Fee</span>
                        <span className="text-xl font-black text-[#031635]">₹{session.price}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedSession(session);
                        setSelectedSlot(session.available_slots[0] || '');
                      }}
                      className="w-full py-3.5 bg-[#031635] hover:bg-[#062454] text-white font-extrabold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2"
                    >
                      <Calendar className="w-4 h-4 text-[#FDBC13]" /> Book Paid 1-on-1 Appointment
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 2 (MIDDLE): SERVICE PROVIDER ACCOUNT SEARCH BY NAME OR SKILL */}
        <section id="provider-search" className="scroll-mt-24 bg-white p-8 rounded-3xl border border-[#E3E2E0] shadow-md">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-extrabold text-xs uppercase tracking-wider inline-block mb-2 border border-blue-200">
                2nd Section / Provider Search
              </span>
              <h2 className="text-2xl font-black text-[#031635] tracking-tight flex items-center gap-2">
                <User className="w-6 h-6 text-blue-600" /> Service Provider Account Directory (Search by Name or Skill)
              </h2>
              <p className="text-sm font-semibold text-[#44474E]">
                Search service providers directly by name or by skill.
              </p>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-[#44474E] absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={providerSearchQuery}
                onChange={(e) => setProviderSearchQuery(e.target.value)}
                placeholder="Search provider name or skill..."
                className="w-full pl-10 pr-4 py-2.5 bg-[#F4F3F1] border border-[#E3E2E0] rounded-2xl text-xs font-semibold text-[#031635] focus:outline-none focus:ring-2 focus:ring-[#031635]"
              />
            </div>
          </div>

          {filteredProviders.length === 0 ? (
            <div className="bg-[#FAF9F6] rounded-3xl border-2 border-dashed border-[#E3E2E0] p-8 text-center space-y-2">
              <UserCheck className="w-10 h-10 text-blue-400 mx-auto" />
              <h3 className="text-base font-extrabold text-[#031635]">No Registered Service Providers Found</h3>
              <p className="text-xs text-[#44474E] font-medium">As soon as service providers register accounts via the Provider portal, they will appear here!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredProviders.map(provider => (
                <div key={provider.id} className="bg-[#FAF9F6] rounded-3xl border border-[#E3E2E0] p-5 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#031635] text-white flex items-center justify-center text-2xl font-bold shadow-sm">
                        {provider.avatar}
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base text-[#031635]">{provider.name}</h4>
                        <span className="text-[11px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 block w-fit">
                          {provider.experience_years}+ Yrs Experience
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <p className="text-xs font-extrabold text-[#031635] line-clamp-1">
                        🎯 Skill: {provider.skill}
                      </p>
                      <p className="text-xs font-semibold text-[#44474E] line-clamp-2">
                        {provider.bio}
                      </p>
                      <div className="flex items-center justify-between text-xs font-bold text-[#44474E] pt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-[#031635]" /> {provider.location}
                        </span>
                        <span className="flex items-center gap-1 text-amber-500 font-extrabold">
                          <Star className="w-3.5 h-3.5 fill-amber-500" /> {provider.rating}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedProvider(provider);
                      setSelectedSlot(provider.available_slots[0] || '');
                    }}
                    className="w-full py-2.5 bg-[#FDBC13] hover:bg-[#e0a50b] text-[#031635] font-extrabold text-xs rounded-2xl shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    <Calendar className="w-3.5 h-3.5" /> Book 1-on-1 Appointment (₹{provider.hourly_rate})
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* SECTION 3 (BOTTOM/LAST): BUYABLE PRODUCTS & PHYSICAL CREATIONS */}
        <section id="products" className="scroll-mt-24">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs uppercase tracking-wider inline-block mb-2 border border-emerald-200">
                3rd Section / Buyable Creations (Last)
              </span>
              <h2 className="text-3xl font-black text-[#031635] tracking-tight flex items-center gap-2">
                <ShoppingBag className="w-7 h-7 text-[#FDBC13]" /> Buyable Products & Physical Creations
              </h2>
              <p className="text-sm font-semibold text-[#44474E]">
                Authentic handmade products posted by service providers.
              </p>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="bg-white rounded-3xl border-2 border-dashed border-[#E3E2E0] p-8 text-center space-y-2">
              <ShoppingBag className="w-10 h-10 text-[#FDBC13] mx-auto" />
              <h3 className="text-base font-extrabold text-[#031635]">No Products Posted Yet</h3>
              <p className="text-xs text-[#44474E] font-medium">When service providers post products for sale in the provider portal, they will automatically appear here!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map(product => (
                <div key={product.id} className="bg-white rounded-3xl border border-[#E3E2E0] overflow-hidden shadow-md hover:shadow-xl transition flex flex-col justify-between group">
                  <div>
                    <div className="relative h-48 w-full bg-slate-100 overflow-hidden">
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-black/70 text-white font-extrabold text-xs backdrop-blur-md">
                        {product.stock} left
                      </span>
                    </div>

                    <div className="p-5">
                      <div className="flex items-center gap-2 text-xs font-extrabold text-[#44474E] mb-2">
                        <span>{product.creator_avatar}</span>
                        <span>{product.creator_name}</span>
                        <span>•</span>
                        <span className="flex items-center text-amber-500 font-extrabold">
                          <Star className="w-3.5 h-3.5 fill-amber-500 mr-0.5" /> {product.rating}
                        </span>
                      </div>

                      <h3 className="text-base font-black text-[#031635] leading-snug mb-2 group-hover:text-blue-700 transition">
                        {product.title}
                      </h3>
                      <p className="text-xs font-semibold text-[#44474E] line-clamp-2 mb-4">
                        {product.description}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-0">
                    <div className="flex items-center justify-between mb-3 border-t border-[#E3E2E0] pt-3">
                      <div>
                        <span className="text-[10px] font-bold text-[#44474E] uppercase block">Price</span>
                        <span className="text-xl font-black text-[#031635]">₹{product.price}</span>
                      </div>
                      <button
                        onClick={() => setSelectedProduct(product)}
                        className="px-4 py-2.5 bg-[#FDBC13] hover:bg-[#e0a50b] text-[#031635] font-extrabold text-sm rounded-2xl shadow-sm transition flex items-center gap-1.5"
                      >
                        <ShoppingBag className="w-4 h-4" /> Buy Product
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* FREE LIVE SESSION PLAYER MODAL */}
      {activeFreeSession && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-[#E3E2E0] animate-scale-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E3E2E0]">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
                <h3 className="text-lg font-black text-[#031635]">Free Community Live Stream</h3>
              </div>
              <button onClick={() => setActiveFreeSession(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-[#44474E]" />
              </button>
            </div>

            <div className="aspect-video w-full bg-slate-900 rounded-2xl overflow-hidden mb-4 relative flex items-center justify-center text-white">
              <div className="text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-xl">
                  <Play className="w-8 h-8 fill-white ml-1" />
                </div>
                <h4 className="font-extrabold text-lg">{activeFreeSession.title}</h4>
                <p className="text-xs text-slate-300">Live Broadcaster: {activeFreeSession.creator_name} ({activeFreeSession.creator_location})</p>
                <span className="inline-block px-3 py-1 bg-emerald-600 text-white text-xs font-extrabold rounded-full">
                  100% Free Live Stream • {activeFreeSession.attendees_count} Live Viewers
                </span>
              </div>
            </div>

            <button
              onClick={() => setActiveFreeSession(null)}
              className="w-full py-3 bg-[#031635] text-white font-extrabold text-sm rounded-2xl shadow-md"
            >
              Close Live Stream
            </button>
          </div>
        </div>
      )}

      {/* PROVIDER VIDEO PLAYER MODAL */}
      {activeVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-[#E3E2E0] animate-scale-in flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E3E2E0] shrink-0">
              <div>
                <h3 className="text-lg font-black text-[#031635] flex items-center gap-2">
                  <Play className="w-5 h-5 text-purple-600 animate-pulse" /> {activeVideo.title}
                </h3>
                <p className="text-xs text-[#44474E] font-bold mt-0.5">Instructor: {activeVideo.creator_name}</p>
              </div>
              <button onClick={() => setActiveVideo(null)} className="p-1.5 rounded-full hover:bg-slate-100 transition">
                <X className="w-5 h-5 text-[#44474E]" />
              </button>
            </div>

            {/* Video container */}
            <div className="aspect-video w-full bg-black rounded-2xl overflow-hidden mb-4 relative shrink-0 shadow-inner">
              <video 
                src={activeVideo.video_url} 
                controls 
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>

            {/* Engagement Metrics & Interaction deck */}
            <div className="flex items-center justify-between py-3 px-4 bg-[#FAF9F6] rounded-2xl border border-[#E3E2E0] mb-4 shrink-0">
              <div className="flex items-center gap-4 text-xs font-black text-[#031635]">
                <span className="flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-slate-500" /> {videoViews} views
                </span>
                <span className="flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-rose-500 fill-rose-500" /> {videoLikes} likes
                </span>
              </div>
              
              <button
                onClick={handleLikeVideo}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold text-xs rounded-xl border border-rose-200 transition active:scale-95"
              >
                <Heart className="w-4 h-4 fill-rose-500" /> Like Video
              </button>
            </div>

            {/* Scrollable Comments feed */}
            <div className="flex-1 overflow-y-auto mb-4 border border-[#E3E2E0] rounded-2xl p-4 bg-[#FAF9F6] min-h-[150px]">
              <h4 className="font-extrabold text-xs text-[#031635] uppercase tracking-wider mb-3">
                💬 Comments ({videoComments.length})
              </h4>
              
              {videoComments.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 font-bold">
                  No comments posted yet. Be the first to start the conversation!
                </div>
              ) : (
                <div className="space-y-3">
                  {videoComments.map((c) => (
                    <div key={c.id} className="bg-white p-3 rounded-xl border border-[#E3E2E0] shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-extrabold text-xs text-purple-700">{c.user_name}</span>
                        <span className="text-[9px] font-bold text-slate-400">
                          {c.created_at ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-[#031635] leading-relaxed">{c.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comment Form */}
            <form onSubmit={handleAddComment} className="flex gap-2 mb-2 shrink-0">
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Type a comment or ask a question..."
                className="flex-1 px-4 py-3 bg-white border-2 border-[#E3E2E0] focus:border-purple-500 outline-none rounded-2xl text-xs font-semibold transition"
              />
              <button
                type="submit"
                className="px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs rounded-2xl shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Post
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CHECKOUTS */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E3E2E0] animate-scale-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E3E2E0]">
              <h3 className="text-lg font-black text-[#031635] flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#FDBC13]" /> Order Confirmation
              </h3>
              <button onClick={() => setSelectedProduct(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-[#44474E]" />
              </button>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <img src={selectedProduct.image_url} alt={selectedProduct.title} className="w-20 h-20 rounded-2xl object-cover" />
              <div>
                <h4 className="font-extrabold text-sm text-[#031635]">{selectedProduct.title}</h4>
                <p className="text-xs text-[#44474E] font-bold mt-1">Provider: {selectedProduct.creator_name}</p>
                <p className="text-base font-black text-[#031635] mt-1">Total: ₹{selectedProduct.price}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedProduct(null)}
                className="w-1/2 py-3 bg-[#F4F3F1] hover:bg-[#E3E2E0] text-[#031635] font-extrabold text-sm rounded-2xl"
              >
                Cancel
              </button>
              <button
                onClick={() => executeProductPurchase(selectedProduct)}
                className="w-1/2 py-3 bg-[#031635] hover:bg-[#062454] text-white font-extrabold text-sm rounded-2xl shadow-md"
              >
                Confirm Order
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedSession && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E3E2E0] animate-scale-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E3E2E0]">
              <h3 className="text-lg font-black text-[#031635] flex items-center gap-2">
                <Video className="w-5 h-5 text-red-500" /> Book Paid 1-on-1 Appointment
              </h3>
              <button onClick={() => setSelectedSession(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-[#44474E]" />
              </button>
            </div>

            <div className="mb-4">
              <h4 className="font-extrabold text-base text-[#031635]">{selectedSession.title}</h4>
              <p className="text-xs text-[#44474E] font-semibold mt-1">Provider: {selectedSession.creator_name} ({selectedSession.creator_experience})</p>
              <p className="text-lg font-black text-[#031635] mt-2">Appointment Fee: ₹{selectedSession.price}</p>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-extrabold text-[#031635] uppercase mb-2">
                Select Available Slot:
              </label>
              <div className="space-y-2">
                {selectedSession.available_slots.map((slot: string) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`w-full p-3 rounded-2xl text-xs font-extrabold text-left border transition ${
                      selectedSlot === slot
                        ? 'border-[#031635] bg-[#031635] text-white shadow-sm'
                        : 'border-[#E3E2E0] bg-[#FAF9F6] text-[#031635] hover:bg-[#F4F3F1]'
                    }`}
                  >
                    📅 {slot}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedSession(null)}
                className="w-1/2 py-3 bg-[#F4F3F1] hover:bg-[#E3E2E0] text-[#031635] font-extrabold text-sm rounded-2xl"
              >
                Cancel
              </button>
              <button
                onClick={() => executeSessionBooking(selectedSession.title, selectedSession.creator_name, selectedSlot, selectedSession.price)}
                className="w-1/2 py-3 bg-[#031635] hover:bg-[#062454] text-white font-extrabold text-sm rounded-2xl shadow-md"
              >
                Confirm Appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProvider && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E3E2E0] animate-scale-in">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#E3E2E0]">
              <h3 className="text-lg font-black text-[#031635] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#FDBC13]" /> Book 1-on-1 Appointment
              </h3>
              <button onClick={() => setSelectedProvider(null)} className="p-1 rounded-full hover:bg-slate-100">
                <X className="w-5 h-5 text-[#44474E]" />
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-[#031635] text-white flex items-center justify-center text-2xl font-bold">
                {selectedProvider.avatar}
              </div>
              <div>
                <h4 className="font-extrabold text-base text-[#031635]">{selectedProvider.name}</h4>
                <p className="text-xs text-[#44474E] font-semibold">{selectedProvider.skill}</p>
                <p className="text-sm font-black text-[#031635] mt-0.5">Rate: ₹{selectedProvider.hourly_rate} / hour</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-extrabold text-[#031635] uppercase mb-2">
                Select Available Slot:
              </label>
              <div className="space-y-2">
                {selectedProvider.available_slots.map(slot => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`w-full p-3 rounded-2xl text-xs font-extrabold text-left border transition ${
                      selectedSlot === slot
                        ? 'border-[#031635] bg-[#031635] text-white shadow-sm'
                        : 'border-[#E3E2E0] bg-[#FAF9F6] text-[#031635] hover:bg-[#F4F3F1]'
                    }`}
                  >
                    📅 {slot}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedProvider(null)}
                className="w-1/2 py-3 bg-[#F4F3F1] hover:bg-[#E3E2E0] text-[#031635] font-extrabold text-sm rounded-2xl"
              >
                Cancel
              </button>
              <button
                onClick={() => executeSessionBooking(`1-on-1 Consultation with ${selectedProvider.name}`, selectedProvider.name, selectedSlot, selectedProvider.hourly_rate)}
                className="w-1/2 py-3 bg-[#031635] hover:bg-[#062454] text-white font-extrabold text-sm rounded-2xl shadow-md"
              >
                Confirm Appointment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING AI MATCHMAKER CHATBOT */}
      {isAiChatOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] bg-white rounded-3xl shadow-2xl border border-[#E3E2E0] overflow-hidden flex flex-col h-[520px] animate-scale-in">
          <div className="bg-[#031635] text-white px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#FDBC13] text-[#031635] flex items-center justify-center font-black">
                ✨
              </div>
              <div>
                <span className="font-extrabold text-sm block">Provider Needs AI Matchmaker</span>
                <span className="text-[10px] text-slate-300 block font-semibold">Ollama Local Server (`qwen3:4b`)</span>
              </div>
            </div>
            <button onClick={() => setIsAiChatOpen(false)} className="text-slate-300 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#FAF9F6]">
            {aiMessages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl text-xs font-semibold leading-relaxed shadow-sm ${
                    msg.role === 'user'
                      ? 'bg-[#031635] text-white rounded-br-none'
                      : 'bg-white text-[#031635] border border-[#E3E2E0] rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>

                {/* Segregated Provider Videos inside AI Chat */}
                {msg.videos && msg.videos.length > 0 && (
                  <div className="w-full mt-2 space-y-2">
                    <span className="text-[10px] font-black text-purple-700 uppercase tracking-wider block">
                      🎥 Segregated Provider Posted Videos (Biryani, Pottery, etc.):
                    </span>
                    {msg.videos.map(v => (
                      <div key={v.id} className="bg-white p-3 rounded-2xl border border-[#E3E2E0] shadow-sm flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <img src={v.thumbnail_url} alt={v.title} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                          <div>
                            <span className="font-extrabold text-xs text-[#031635] block leading-tight">{v.title}</span>
                            <span className="text-[10px] font-bold text-[#44474E] block">By {v.creator_name} • {v.video_duration}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handlePlayVideo(v)}
                          className="px-3 py-1.5 bg-purple-600 text-white text-[11px] font-bold rounded-xl shrink-0"
                        >
                          Watch Video
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {msg.sessions && msg.sessions.length > 0 && (
                  <div className="w-full mt-2 space-y-2">
                    <span className="text-[10px] font-black text-red-600 uppercase tracking-wider block">
                      📹 Segregated Paid 1-on-1 Appointments:
                    </span>
                    {msg.sessions.map(s => (
                      <div key={s.id} className="bg-white p-3 rounded-2xl border border-[#E3E2E0] shadow-sm flex items-center justify-between">
                        <div>
                          <span className="font-extrabold text-xs text-[#031635] block">{s.title}</span>
                          <span className="text-[10px] font-bold text-[#44474E] block">With {s.creator_name} • ₹{s.price}</span>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedSession(s);
                            setSelectedSlot(s.available_slots[0] || '');
                          }}
                          className="px-3 py-1.5 bg-[#031635] text-white text-[11px] font-bold rounded-xl"
                        >
                          Book Appointment
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {msg.products && msg.products.length > 0 && (
                  <div className="w-full mt-2 space-y-2">
                    <span className="text-[10px] font-black text-[#031635] uppercase tracking-wider block">
                      🏺 Segregated Buyable Products:
                    </span>
                    {msg.products.map(p => (
                      <div key={p.id} className="bg-white p-3 rounded-2xl border border-[#E3E2E0] shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={p.image_url} alt={p.title} className="w-9 h-9 rounded-xl object-cover" />
                          <div>
                            <span className="font-extrabold text-xs text-[#031635] block leading-tight">{p.title}</span>
                            <span className="text-[10px] font-bold text-[#44474E] block">By {p.creator_name} • ₹{p.price}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedProduct(p)}
                          className="px-3 py-1.5 bg-[#FDBC13] text-[#031635] text-[11px] font-bold rounded-xl"
                        >
                          Buy Product
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isAiThinking && (
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#44474E]">
                <Sparkles className="w-4 h-4 animate-spin text-[#FDBC13]" /> Searching provider videos & sessions with Ollama...
              </div>
            )}
          </div>

          <form onSubmit={handleAiSearchSubmit} className="p-3 bg-white border-t border-[#E3E2E0] flex items-center gap-2">
            <input
              type="text"
              value={aiChatInput}
              onChange={(e) => setAiChatInput(e.target.value)}
              placeholder="Search biryani, pottery, cooking..."
              className="flex-1 bg-[#F4F3F1] border border-[#E3E2E0] rounded-2xl px-3.5 py-2 text-xs font-semibold text-[#031635] focus:outline-none"
            />
            <button
              type="submit"
              disabled={isAiThinking}
              className="p-2 bg-[#031635] text-white rounded-2xl hover:bg-[#062454] transition"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* REALTIME BOOKING TRACKER MODAL */}
      {activeBookingTracker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-7 shadow-2xl border-2 border-[#031635] animate-scale-in text-center space-y-4">
            {activeBookingTracker.status === 'REQUESTED' ? (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-3xl mx-auto animate-bounce">
                  ⏳
                </div>
                <h3 className="text-2xl font-black text-[#031635]">Booking Request Sent!</h3>
                <p className="text-sm font-semibold text-[#44474E]">
                  We notified <strong>{activeBookingTracker.providerName}</strong> on their Senior Portal.
                </p>

                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-left space-y-1.5">
                  <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Service Details</div>
                  <div className="text-base font-black text-[#031635]">{activeBookingTracker.serviceName}</div>
                  <div className="text-xs font-bold text-[#44474E]">📅 Slot: {activeBookingTracker.slot}</div>
                  <div className="text-xs font-bold text-[#44474E]">💰 Total: ₹{activeBookingTracker.price}</div>
                </div>

                <div className="p-3 bg-[#FAF9F6] rounded-2xl border border-[#E3E2E0] flex items-center justify-center gap-2 text-xs font-extrabold text-amber-800 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Waiting for Senior to confirm with double-tap...
                </div>

                <button
                  onClick={() => setActiveBookingTracker(null)}
                  className="w-full py-3 bg-[#F4F3F1] hover:bg-[#E3E2E0] text-[#031635] font-extrabold text-sm rounded-2xl transition"
                >
                  Minimize & Browse
                </button>
              </>
            ) : activeBookingTracker.status === 'ACCEPTED' ? (
              <>
                <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-5xl mx-auto shadow-lg animate-bounce">
                  🎉
                </div>
                <h3 className="text-2xl font-black text-emerald-800">Booking Confirmed!</h3>
                <p className="text-base font-bold text-[#031635]">
                  <strong>{activeBookingTracker.providerName}</strong> agreed to help you! ❤️
                </p>

                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-4 text-left space-y-1.5 shadow-sm">
                  <div className="text-xs font-black text-emerald-800 uppercase tracking-wider">Confirmed Session</div>
                  <div className="text-lg font-black text-[#031635]">{activeBookingTracker.serviceName}</div>
                  <div className="text-sm font-bold text-emerald-900">📅 {activeBookingTracker.slot}</div>
                </div>

                <button
                  onClick={() => setActiveBookingTracker(null)}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base rounded-2xl shadow-lg transition"
                >
                  Great, Thank You!
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-3xl mx-auto">
                  ℹ️
                </div>
                <h3 className="text-xl font-black text-[#031635]">Provider is Busy</h3>
                <p className="text-sm font-semibold text-[#44474E]">
                  {activeBookingTracker.providerName} cannot take this appointment right now. Please select another time slot or another provider.
                </p>
                <button
                  onClick={() => setActiveBookingTracker(null)}
                  className="w-full py-3 bg-[#031635] text-white font-extrabold text-sm rounded-2xl"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
