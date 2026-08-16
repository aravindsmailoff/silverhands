'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSavedConsumerUser } from '@/lib/consumer-store';
import { 
  Heart, MessageSquare, Send, X, Users, Sparkles, Volume2, Maximize, Radio, CornerDownRight 
} from 'lucide-react';

export default function ConsumerLiveRoomPage() {
  const router = useRouter();
  const params = useParams();
  const rawRoomId = params ? params.id : '';
  const roomId = Array.isArray(rawRoomId) ? rawRoomId[0] : rawRoomId;

  // State
  const [user, setUser] = useState<any>(null);
  const [streamInfo, setStreamInfo] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [viewerCount, setViewerCount] = useState(1);
  const [floatingHearts, setFloatingHearts] = useState<Array<{ id: number; left: number }>>([]);
  const [isEnded, setIsEnded] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Audio simulation state
  const [volume, setVolume] = useState(80);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const heartIdCounter = useRef(0);

  // Load User, Join Stream
  useEffect(() => {
    const saved = getSavedConsumerUser();
    setUser(saved || { username: 'Senior Learner' });

    if (!roomId) return;

    // Join live stream in DB
    fetch('/api/live-streams/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streamId: roomId })
    }).catch(err => console.warn('Join count increment failed:', err));

    // Cleanup on leave
    return () => {
      fetch('/api/live-streams/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId: roomId })
      }).catch(err => console.warn('Leave count decrement failed:', err));
    };
  }, [roomId]);

  // Polling Stream Status and Chat Comments
  useEffect(() => {
    if (!roomId) return;

    const poll = async () => {
      try {
        // Poll streams list for matches
        const streamRes = await fetch('/api/live-streams');
        const streamData = await streamRes.json();
        if (streamData.success && Array.isArray(streamData.streams)) {
          const matched = streamData.streams.find((s: any) => s.id === roomId);
          if (matched) {
            setStreamInfo(matched);
            setViewerCount(matched.viewer_count || 1);
            if (matched.status === 'ended') {
              setIsEnded(true);
            }
          } else {
            // Not found in active streams -> ended
            setIsEnded(true);
          }
        }

        // Poll chat comments
        const chatRes = await fetch(`/api/live-streams/chat?streamId=${roomId}`);
        const chatData = await chatRes.json();
        if (chatData.success) {
          setChatMessages(chatData.comments || []);
        }
      } catch (err) {
        console.warn('Live stream consumer polling error:', err);
      }
    };

    poll(); // Run initially
    const pollId = setInterval(poll, 3000);

    return () => clearInterval(pollId);
  }, [roomId]);

  // Trigger floating heart animations
  const triggerHeartReaction = () => {
    const id = heartIdCounter.current++;
    const randomLeft = Math.floor(Math.random() * 60) + 20; // 20% to 80% width
    setFloatingHearts(prev => [...prev, { id, left: randomLeft }]);

    // Remove heart after animation ends (2.5s)
    setTimeout(() => {
      setFloatingHearts(prev => prev.filter(h => h.id !== id));
    }, 2500);
  };

  // Toggle fullscreen
  const handleToggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  // Post Comment/Chat
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.trim() || !roomId) return;
    const text = newMsg;
    setNewMsg('');

    try {
      const res = await fetch('/api/live-streams/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId: roomId, userName: user?.username || 'Learner', comment: text })
      });
      const data = await res.json();
      if (data.success) {
        setChatMessages(prev => [...prev, data.comment]);
      }
    } catch (e) {
      console.warn('Error sending chat comment:', e);
    }
  };

  // Ask AI about current masterclass topic
  const handleAskAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim() || !roomId) return;
    setIsAiLoading(true);
    setAiAnswer('');

    try {
      const res = await fetch('/api/ai/live-stream-ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: aiQuestion,
          streamTitle: streamInfo?.title || 'Live Masterclass',
          streamDesc: streamInfo?.description || 'Active live stream'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAiAnswer(data.answer);
      } else {
        setAiAnswer('Sorry, I was unable to connect to the AI engine right now.');
      }
    } catch (err) {
      setAiAnswer('An error occurred while calling the AI matching agent.');
    } finally {
      setIsAiLoading(false);
    }
  };

  if (isEnded) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white border border-[#E3E2E0] rounded-3xl p-8 shadow-xl space-y-5">
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto text-3xl">
            🛑
          </div>
          <h1 className="text-2xl font-black text-[#031635] tracking-tight">Live Stream Ended</h1>
          <p className="text-xs text-[#44474E] font-medium leading-relaxed">
            The host has ended this live masterclass session. Thank you for participating! Check out other lessons or browse provider accounts on the portal.
          </p>
          <button
            onClick={() => router.push('/consumer/dashboard')}
            className="w-full py-3 bg-[#031635] text-white font-extrabold text-sm rounded-2xl shadow-md transition hover:bg-[#062454] active:scale-95"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#031635] flex flex-col">
      {/* Header Deck */}
      <header className="px-6 py-4 bg-white border-b border-[#E3E2E0] flex items-center justify-between sticky top-0 z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-red-600 rounded-full text-white text-[10px] font-black animate-pulse">
            <Radio className="w-3.5 h-3.5 fill-white" /> LIVE NOW
          </div>
          <div>
            <h1 className="text-base font-black leading-tight">{streamInfo?.title || 'Cooking Masterclass'}</h1>
            <span className="text-[10px] font-bold text-[#44474E]">By {streamInfo?.creator_name || 'Senior Master'}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-xs font-extrabold text-[#44474E] bg-[#FAF9F6] border border-[#E3E2E0] px-3 py-1.5 rounded-xl">
            <Users className="w-3.5 h-3.5 text-purple-600" /> {viewerCount} watching
          </span>
          <button
            onClick={() => router.push('/consumer/dashboard')}
            className="p-2 hover:bg-slate-100 rounded-xl transition"
            title="Leave Stream"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main interactive deck split */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full max-w-screen-2xl mx-auto">
        
        {/* Left Column: Player & AI Ask */}
        <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto max-h-[85vh] lg:max-h-none">
          {/* WebRTC simulated player container */}
          <div 
            ref={videoContainerRef}
            className="aspect-video w-full bg-slate-900 rounded-3xl overflow-hidden relative shadow-lg group border border-[#E3E2E0]"
          >
            {/* Real Broadcast Camera Loop (using dummy/simulated media) */}
            <div className="w-full h-full flex items-center justify-center relative">
              <div className="absolute inset-0 bg-[#0c1b35] flex items-center justify-center text-center p-6">
                <div className="space-y-4">
                  <div className="w-20 h-20 rounded-full bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto text-4xl animate-pulse">
                    👵🏽
                  </div>
                  <h4 className="font-extrabold text-white text-lg">{streamInfo?.creator_name || 'Senior Host'}'s Live Feed</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    Streaming live WebRTC media audio/video channel securely...
                  </p>
                </div>
              </div>

              {/* Floating Heart Animations */}
              {floatingHearts.map(h => (
                <div 
                  key={h.id}
                  className="absolute bottom-16 text-3xl animate-float-heart z-20"
                  style={{ left: `${h.left}%` }}
                >
                  ❤️
                </div>
              ))}
            </div>

            {/* Video overlay controls */}
            <div className="absolute bottom-4 left-4 right-4 py-2.5 px-4 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl flex items-center justify-between text-white transition-opacity duration-300 opacity-90 group-hover:opacity-100">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-slate-300" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={e => setVolume(Number(e.target.value))}
                  className="w-20 h-1 accent-[#FDBC13] rounded-lg cursor-pointer bg-white/20"
                />
              </div>

              <div className="flex items-center gap-3">
                {/* Floating Heart reaction button */}
                <button
                  onClick={triggerHeartReaction}
                  className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-lg transition transform hover:scale-110 active:scale-95"
                  title="Send Heart Reaction"
                >
                  <Heart className="w-4 h-4 fill-white" />
                </button>
                
                <button
                  onClick={handleToggleFullscreen}
                  className="p-2 hover:bg-white/10 text-white rounded-xl transition"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Ask AI Classroom Assistant Card */}
          <div className="bg-white rounded-3xl border border-[#E3E2E0] p-6 shadow-md">
            <h3 className="text-sm font-black text-[#031635] flex items-center gap-2 mb-1.5">
              <Sparkles className="w-5 h-5 text-[#FDBC13]" /> Ask AI Classroom Assistant
            </h3>
            <p className="text-xs text-[#44474E] font-medium mb-4">
              Type any question about the recipes, steps, or tips being demonstrated in the stream. Our AI will guide you!
            </p>

            <form onSubmit={handleAskAi} className="flex gap-2">
              <input
                type="text"
                value={aiQuestion}
                onChange={e => setAiQuestion(e.target.value)}
                placeholder="Ask e.g. How much salt should I add? What temperature?"
                className="flex-1 px-4 py-3 bg-[#FAF9F6] border-2 border-[#E3E2E0] focus:border-[#FDBC13] outline-none rounded-2xl text-xs font-semibold transition"
              />
              <button
                type="submit"
                disabled={isAiLoading}
                className="px-5 py-3 bg-[#031635] hover:bg-[#062454] text-[#FDBC13] font-extrabold text-xs rounded-2xl shadow-md transition disabled:opacity-50"
              >
                {isAiLoading ? 'Asking...' : 'Ask AI'}
              </button>
            </form>

            {aiAnswer && (
              <div className="mt-4 p-4 bg-[#FAF9F6] rounded-2xl border border-[#E3E2E0] animate-fade-in flex gap-2">
                <CornerDownRight className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <span className="text-[10px] font-black text-purple-700 block uppercase tracking-wider mb-1">AI Assistant Answer:</span>
                  <p className="text-xs font-semibold text-[#031635] leading-relaxed">{aiAnswer}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Chat Side-Deck */}
        <div className="w-full lg:w-96 bg-white border-t lg:border-t-0 lg:border-l border-[#E3E2E0] flex flex-col justify-between max-h-[400px] lg:max-h-none shrink-0 shadow-lg">
          <div className="p-4 border-b border-[#E3E2E0] flex items-center justify-between bg-[#FAF9F6]">
            <h3 className="font-extrabold text-sm text-[#031635] flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-purple-600" /> Interactive Stream Chat
            </h3>
            <span className="text-[9px] font-bold text-slate-500">Live chat updates</span>
          </div>

          {/* Messages view */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[250px] lg:max-h-none">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-purple-600" />
                <span className="text-xs font-bold">No messages yet</span>
                <span className="text-[10px] mt-0.5">Type in the box below to say hello!</span>
              </div>
            ) : (
              chatMessages.map(m => (
                <div key={m.id} className="bg-[#FAF9F6] p-3 rounded-xl border border-[#E3E2E0] shadow-sm">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-extrabold text-xs text-purple-700 truncate max-w-[150px]">{m.user_name}</span>
                    <span className="text-[8px] font-bold text-slate-400">
                      {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#031635] leading-normal">{m.comment}</p>
                </div>
              ))
            )}
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSendChat} className="p-4 bg-[#FAF9F6] border-t border-[#E3E2E0] flex gap-2 shrink-0">
            <input
              type="text"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder="Send a chat message..."
              className="flex-1 px-4 py-2.5 bg-white border border-[#E3E2E0] rounded-xl focus:border-purple-500 outline-none text-xs font-semibold transition"
            />
            <button
              type="submit"
              className="p-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md transition flex items-center justify-center active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
