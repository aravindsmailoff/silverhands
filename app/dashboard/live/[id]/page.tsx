'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getSavedProfile } from '@/lib/voice-agent';
import { 
  Mic, MicOff, Video, VideoOff, ScreenShare, MessageSquare, Send, X, Users, LogOut, Radio 
} from 'lucide-react';

export default function CreatorLiveRoomPage() {
  const router = useRouter();
  const params = useParams();
  const rawRoomId = params ? params.id : '';
  const roomId = Array.isArray(rawRoomId) ? rawRoomId[0] : rawRoomId;

  // Media references
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // States
  const [micActive, setMicActive] = useState(true);
  const [camActive, setCamActive] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [streamTitle, setStreamTitle] = useState('SilverHands Live Stream');

  // Initialize Media
  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: true
        });
        streamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Error accessing camera/mic:', err);
        alert('Could not access camera or microphone. Please grant permissions.');
      }
    }
    startCamera();

    return () => {
      stopAllTracks();
    };
  }, []);

  // Poll stream details and chat
  useEffect(() => {
    if (!roomId) return;

    // Fetch stream title initially
    fetch(`/api/live-streams`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.streams)) {
          const matched = data.streams.find((s: any) => s.id === roomId);
          if (matched) {
            setStreamTitle(matched.title);
            setViewerCount(matched.viewer_count || 0);
          }
        }
      });

    // Polling interval for viewer count and chat
    const pollId = setInterval(async () => {
      try {
        // Fetch viewer count
        const streamRes = await fetch(`/api/live-streams`);
        const streamData = await streamRes.json();
        if (streamData.success && Array.isArray(streamData.streams)) {
          const matched = streamData.streams.find((s: any) => s.id === roomId);
          if (matched) {
            setViewerCount(matched.viewer_count || 0);
          }
        }

        // Fetch chat messages
        const chatRes = await fetch(`/api/live-streams/chat?streamId=${roomId}`);
        const chatData = await chatRes.json();
        if (chatData.success) {
          setChatMessages(chatData.comments || []);
        }
      } catch (e) {
        console.warn('Polling error inside creator live room:', e);
      }
    }, 3000);

    return () => clearInterval(pollId);
  }, [roomId]);

  const stopAllTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
    }
  };

  // Toggle Audio Track
  const handleToggleMic = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micActive;
        setMicActive(!micActive);
      }
    }
  };

  // Toggle Video Track
  const handleToggleCam = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !camActive;
        setCamActive(!camActive);
      }
    }
  };

  // Toggle Screen Share
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop sharing screen, revert to camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (streamRef.current && localVideoRef.current) {
        localVideoRef.current.srcObject = streamRef.current;
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;

        // If screen sharing stops via browser bar
        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          if (streamRef.current && localVideoRef.current) {
            localVideoRef.current.srcObject = streamRef.current;
          }
        };

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        setIsScreenSharing(true);
      } catch (err) {
        console.error('Error starting screen share:', err);
      }
    }
  };

  // Send Chat Message
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.trim() || !roomId) return;
    const profile = getSavedProfile();
    const creatorName = profile?.name || 'Senior Creator';
    const text = newMsg;
    setNewMsg('');

    try {
      const res = await fetch('/api/live-streams/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId: roomId, userName: `${creatorName} (Host)`, comment: text })
      });
      const data = await res.json();
      if (data.success) {
        setChatMessages(prev => [...prev, data.comment]);
      }
    } catch (e) {
      console.warn('Error sending chat message:', e);
    }
  };

  // End Stream Session
  const handleEndLive = async () => {
    if (!confirm('Are you sure you want to end this live stream session?')) return;
    stopAllTracks();

    try {
      // End session in DB
      await fetch(`/api/live-streams?streamId=${roomId}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Error ending stream in database:', e);
    }

    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#031635] text-white flex flex-col">
      {/* Top Header */}
      <header className="px-6 py-4 bg-[#0A2E66] border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-red-600 rounded-full text-xs font-black animate-pulse">
            <Radio className="w-4 h-4 fill-white" /> LIVE
          </div>
          <h1 className="text-lg font-black tracking-tight">{streamTitle}</h1>
        </div>

        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-slate-300">
            <Users className="w-4 h-4" /> {viewerCount} viewing
          </span>
          <button
            onClick={handleEndLive}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs rounded-xl shadow-md transition"
          >
            End Live Session
          </button>
        </div>
      </header>

      {/* Main Studio Deck */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Stream Video Frame */}
        <div className="flex-1 p-6 flex flex-col justify-between relative bg-black/40">
          <div className="relative w-full flex-1 rounded-2xl bg-black overflow-hidden shadow-inner flex items-center justify-center">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />

            {/* Live Stats Overlay */}
            <div className="absolute top-4 left-4 flex gap-2">
              <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg text-[10px] font-black tracking-wider uppercase border border-white/10">
                Host Stream Studio
              </span>
              {isScreenSharing && (
                <span className="px-3 py-1 bg-purple-600 rounded-lg text-[10px] font-black tracking-wider uppercase">
                  Screen Sharing Active
                </span>
              )}
            </div>
          </div>

          {/* Control Bar */}
          <div className="mt-4 py-4 px-6 bg-[#0A2E66]/80 backdrop-blur-md rounded-2xl border border-white/10 flex items-center justify-center gap-4">
            <button
              onClick={handleToggleMic}
              className={`p-3.5 rounded-2xl transition ${
                micActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
              }`}
              title={micActive ? 'Mute Mic' : 'Unmute Mic'}
            >
              {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            <button
              onClick={handleToggleCam}
              className={`p-3.5 rounded-2xl transition ${
                camActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
              }`}
              title={camActive ? 'Stop Camera' : 'Start Camera'}
            >
              {camActive ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>

            <button
              onClick={handleToggleScreenShare}
              className={`p-3.5 rounded-2xl transition ${
                isScreenSharing ? 'bg-purple-600 hover:bg-purple-700 text-white animate-pulse' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
            >
              <ScreenShare className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Chat Side-Deck */}
        <div className="w-full lg:w-96 bg-[#0A2E66]/40 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col justify-between">
          <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#0A2E66]/60">
            <h3 className="font-extrabold text-sm flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-purple-400" /> Live Learner Chat
            </h3>
            <span className="text-[10px] font-bold text-slate-400">Real-time polling active</span>
          </div>

          {/* Messages view */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3 max-h-[300px] lg:max-h-none">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-purple-400" />
                <span className="text-xs font-bold">No messages in chat yet</span>
                <span className="text-[10px] mt-0.5">Learners joining the stream can comment here.</span>
              </div>
            ) : (
              chatMessages.map(m => (
                <div key={m.id} className="bg-[#0A2E66]/60 p-3 rounded-xl border border-white/5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-black text-xs text-purple-300 truncate max-w-[150px]">{m.user_name}</span>
                    <span className="text-[8px] font-bold text-slate-400">
                      {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-100 leading-normal">{m.comment}</p>
                </div>
              ))
            )}
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSendChat} className="p-4 bg-[#0A2E66]/60 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              placeholder="Post an announcement or reply..."
              className="flex-1 px-4 py-2.5 bg-black/30 border border-white/10 rounded-xl focus:border-purple-500 outline-none text-xs font-semibold placeholder:text-slate-500 transition"
            />
            <button
              type="submit"
              className="p-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md transition flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
