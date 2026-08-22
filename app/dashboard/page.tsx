'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSavedProfile, voiceAgent, setActiveUserAccount } from '@/lib/voice-agent';
import { LogOut, Bell, CheckCircle2 } from 'lucide-react';
import ProviderServiceManager from '@/components/provider/ProviderServiceManager';
import ProviderRequestPanel from '@/components/nearby/ProviderRequestPanel';
import { useRealtimeLocation } from '@/lib/hooks/useRealtimeLocation';
import { useDeviceLocation } from '@/lib/hooks/useDeviceLocation';
import { ServiceRequestPayload } from '@/lib/location-protocol';

type HomeView = 'HOME' | 'WHAT_I_CAN_DO' | 'APPOINTMENTS';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function SeniorHomePage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [userServices, setUserServices] = useState<string[]>([]);
  const [view, setView] = useState<HomeView>('HOME');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState<boolean>(false);

  // Accepted/pending requests stored in localStorage so the "My Appointments" 
  // section can show them without requiring the realtime hook here.
  const [appointments, setAppointments] = useState<Array<{
    name: string; service: string; time: string; status: string;
  }>>([]);

  // Device GPS
  const { coordinates } = useDeviceLocation(true);

  // Realtime WebSocket for incoming booking alerts
  const {
    incomingRequests,
    respondServiceRequest,
    markRequestsRead,
    unreadRequestCount,
  } = useRealtimeLocation({
    coordinates,
    sharingEnabled: true,
    radiusMeters: 5000,
  });

  const pendingRequests = incomingRequests.filter((r) => r.status === 'REQUESTED');

  // Auto-open request modal when a new booking arrives if not already open
  useEffect(() => {
    if (pendingRequests.length > 0) {
      setIsRequestModalOpen(true);
    }
  }, [pendingRequests.length]);

  useEffect(() => {
    const saved = getSavedProfile();
    if (saved && saved.name) {
      setUserName(saved.name);
      try {
        const stored = localStorage.getItem('silverhands_provider_services');
        if (stored) {
          const svcs = JSON.parse(stored);
          setUserServices(svcs.filter((s: any) => s.status === 'ACTIVE').map((s: any) => s.title));
        } else if (saved.services?.length) {
          setUserServices(saved.services.map((s: any) => (typeof s === 'string' ? s : s.name)));
        }
      } catch (e) {}

      // Load appointments from localStorage (set by ProviderRequestPanel on accept)
      try {
        const appts = localStorage.getItem('silverhands_appointments');
        if (appts) setAppointments(JSON.parse(appts));
      } catch (e) {}
    } else {
      router.push('/');
    }
  }, [router]);

  // Refresh services whenever view changes back to home
  useEffect(() => {
    if (view === 'HOME') {
      try {
        const stored = localStorage.getItem('silverhands_provider_services');
        if (stored) {
          const svcs = JSON.parse(stored);
          setUserServices(svcs.filter((s: any) => s.status === 'ACTIVE').map((s: any) => s.title));
        }
        const appts = localStorage.getItem('silverhands_appointments');
        if (appts) setAppointments(JSON.parse(appts));
      } catch (e) {}
    }
  }, [view]);

  const handleLogout = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setActiveUserAccount('');
    voiceAgent.resetState();
    router.push('/');
  };

  const handleRespondBooking = (reqId: string, action: 'ACCEPT' | 'REJECT') => {
    respondServiceRequest(reqId, action);
    // Refresh appointments list
    setTimeout(() => {
      try {
        const appts = localStorage.getItem('silverhands_appointments');
        if (appts) setAppointments(JSON.parse(appts));
      } catch (e) {}
    }, 500);
  };

  const greeting = getTimeGreeting();
  const firstName = userName?.split(' ')[0] || '';

  // ── My Appointments View ──────────────────────────────────────────────────
  if (view === 'APPOINTMENTS') {
    return (
      <div className="min-h-screen bg-[#FFFDF7] flex flex-col" style={{ fontFamily: "'Lexend', sans-serif" }}>
        <header className="bg-white border-b-4 border-[#FDBC13] shadow-sm">
          <div className="max-w-2xl mx-auto px-5 py-5 flex items-center justify-between">
            <button
              onClick={() => setView('HOME')}
              className="flex items-center gap-2 text-[#031635] font-bold text-lg"
            >
              <span className="text-2xl">←</span> Back
            </button>
            <div className="w-12 h-12 bg-[#031635] rounded-2xl flex items-center justify-center text-xl shadow-md">🤝</div>
          </div>
        </header>

        <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 space-y-6">
          <h1 className="text-4xl font-black text-[#031635]">📅 My Appointments</h1>
          <p className="text-xl text-[#44474E] font-medium">People you agreed to help</p>

          {appointments.length === 0 ? (
            <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-10 text-center space-y-4 shadow-sm">
              <div className="text-6xl">📭</div>
              <p className="text-2xl font-bold text-[#031635]">No appointments yet</p>
              <p className="text-lg text-[#44474E]">
                When you agree to help someone, it will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {appointments.map((appt, i) => (
                <div key={i} className="bg-white border-2 border-emerald-300 rounded-3xl p-6 shadow-sm space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🍳</span>
                    <div>
                      <p className="text-xl font-black text-[#031635]">{appt.service}</p>
                      <p className="text-base font-semibold text-[#44474E]">Help {appt.name}</p>
                    </div>
                  </div>
                  {appt.time && (
                    <p className="text-lg font-bold text-[#031635] pl-12">{appt.time}</p>
                  )}
                  <p className="text-base font-semibold text-emerald-700 pl-12">✓ You agreed to help</p>
                </div>
              ))}
            </div>
          )}

          <Link
            href="/nearby?role=senior"
            className="block w-full py-5 bg-[#031635] text-white text-xl font-black rounded-3xl shadow-lg text-center"
          >
            📍 See People Near Me
          </Link>
        </main>
      </div>
    );
  }

  // ── What I Can Do View ────────────────────────────────────────────────────
  if (view === 'WHAT_I_CAN_DO') {
    return (
      <div className="min-h-screen bg-[#FFFDF7] flex flex-col" style={{ fontFamily: "'Lexend', sans-serif" }}>
        <header className="bg-white border-b-4 border-[#FDBC13] shadow-sm">
          <div className="max-w-2xl mx-auto px-5 py-5 flex items-center justify-between">
            <button
              onClick={() => setView('HOME')}
              className="flex items-center gap-2 text-[#031635] font-bold text-lg"
            >
              <span className="text-2xl">←</span> Back
            </button>
            <div className="w-12 h-12 bg-[#031635] rounded-2xl flex items-center justify-center text-xl shadow-md">🤝</div>
          </div>
        </header>

        <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 space-y-6">
          <h1 className="text-4xl font-black text-[#031635]">👩‍🍳 What I Can Do</h1>
          <p className="text-xl text-[#44474E] font-medium">
            The things you help people with
          </p>
          <ProviderServiceManager />
        </main>
      </div>
    );
  }

  // ── Main Home Screen ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FFFDF7] flex flex-col" style={{ fontFamily: "'Lexend', sans-serif" }}>

      {/* Header */}
      <header className="bg-white border-b-4 border-[#FDBC13] shadow-sm">
        <div className="max-w-2xl mx-auto px-5 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-12 h-12 bg-[#031635] rounded-2xl flex items-center justify-center text-2xl shadow-md">
              🤝
            </div>
            <span className="font-black text-2xl text-[#031635]">SilverHands</span>
          </Link>

          <div className="flex items-center gap-3">
            {pendingRequests.length > 0 && (
              <button
                onClick={() => {
                  markRequestsRead();
                  setIsRequestModalOpen(true);
                }}
                className="relative flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-base font-black transition shadow-lg animate-bounce"
              >
                <Bell className="w-5 h-5 animate-spin" />
                <span>New Booking ({pendingRequests.length})</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-base font-bold transition shadow-sm active:scale-95"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-5 py-8 space-y-8">

        {/* Greeting */}
        <div className="space-y-1">
          <p className="text-2xl font-semibold text-[#44474E]">{greeting},</p>
          <h1 className="text-5xl font-black text-[#031635] leading-tight">
            {firstName} 👋
          </h1>
          <p className="text-xl text-[#44474E] font-medium pt-1">What would you like to do?</p>
        </div>

        {/* 4 Big Cards */}
        <div className="space-y-4">

          {/* Card 1: What I Can Do */}
          <button
            id="card-what-i-can-do"
            onClick={() => setView('WHAT_I_CAN_DO')}
            className="w-full bg-[#031635] text-white rounded-3xl p-7 flex items-center gap-6 shadow-lg active:scale-[0.98] transition-all text-left"
          >
            <span className="text-6xl leading-none shrink-0">👩‍🍳</span>
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-black leading-tight">What I Can Do</div>
              {userServices.length > 0 ? (
                <div className="text-[#FDBC13] text-base font-semibold mt-1 truncate">
                  {userServices.slice(0, 3).join(', ')}
                </div>
              ) : (
                <div className="text-slate-300 text-base font-semibold mt-1">
                  Add the things you can help with
                </div>
              )}
            </div>
          </button>

          {/* Card 2: People Need My Help */}
          <button
            id="card-people-need-help"
            onClick={() => {
              markRequestsRead();
              setIsRequestModalOpen(true);
            }}
            className={`w-full ${
              pendingRequests.length > 0
                ? 'bg-amber-100 border-4 border-amber-500 ring-4 ring-amber-200 animate-pulse'
                : 'bg-amber-50 border-2 border-amber-300'
            } rounded-3xl p-7 flex items-center gap-6 shadow-sm active:scale-[0.98] transition-all text-left block`}
          >
            <span className="text-6xl leading-none shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-2xl font-black text-amber-900 leading-tight">People Need My Help</div>
                {pendingRequests.length > 0 && (
                  <span className="px-3 py-0.5 rounded-full bg-rose-600 text-white font-black text-xs">
                    {pendingRequests.length} NEW
                  </span>
                )}
              </div>
              <div className="text-amber-700 text-base font-semibold mt-1">
                {pendingRequests.length > 0
                  ? `${pendingRequests.length} person is asking for your help right now!`
                  : 'See who is asking for your help'}
              </div>
            </div>
          </button>

          {/* Card 3: People Near Me */}
          <Link
            id="card-people-near-me"
            href="/nearby?role=senior"
            className="w-full bg-emerald-50 border-2 border-emerald-300 rounded-3xl p-7 flex items-center gap-6 shadow-sm active:scale-[0.98] transition-all text-left block"
          >
            <span className="text-6xl leading-none shrink-0">📍</span>
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-black text-emerald-900 leading-tight">People Near Me</div>
              <div className="text-emerald-700 text-base font-semibold mt-1">
                See who is nearby on the map
              </div>
            </div>
          </Link>

          {/* Card 4: My Appointments */}
          <button
            id="card-my-appointments"
            onClick={() => setView('APPOINTMENTS')}
            className="w-full bg-sky-50 border-2 border-sky-300 rounded-3xl p-7 flex items-center gap-6 shadow-sm active:scale-[0.98] transition-all text-left"
          >
            <span className="text-6xl leading-none shrink-0">📅</span>
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-black text-sky-900 leading-tight">My Appointments</div>
              {appointments.length > 0 ? (
                <div className="text-sky-700 text-base font-semibold mt-1">
                  {appointments.length} upcoming {appointments.length === 1 ? 'appointment' : 'appointments'}
                </div>
              ) : (
                <div className="text-sky-600 text-base font-semibold mt-1">
                  Your upcoming help sessions
                </div>
              )}
            </div>
          </button>
        </div>

        {/* Live Stream Quick Access */}
        <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-sm">
          <p className="text-lg font-black text-[#031635] mb-4">More things you can do</p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/dashboard/live"
              className="flex flex-col items-center gap-2 p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl text-center active:scale-95 transition"
            >
              <span className="text-4xl">🎥</span>
              <span className="text-base font-black text-rose-900">Go Live</span>
            </Link>
            <Link
              href="/profile"
              className="flex flex-col items-center gap-2 p-4 bg-white border-2 border-[#E3E2E0] rounded-2xl text-center active:scale-95 transition"
            >
              <span className="text-4xl">👤</span>
              <span className="text-base font-black text-[#031635]">My Profile</span>
            </Link>
            <Link
              href="/products"
              className="flex flex-col items-center gap-2 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl text-center active:scale-95 transition"
            >
              <span className="text-4xl">🛍️</span>
              <span className="text-base font-black text-amber-900">My Products</span>
            </Link>
            <Link
              href="/providers"
              className="flex flex-col items-center gap-2 p-4 bg-sky-50 border-2 border-sky-200 rounded-2xl text-center active:scale-95 transition"
            >
              <span className="text-4xl">📋</span>
              <span className="text-base font-black text-sky-900">People Asking</span>
            </Link>
          </div>
        </div>

        <p className="text-center text-base text-[#75777F] font-medium pb-4">
          Need help? Go to <strong className="text-[#031635]">My Profile</strong> and tap <strong className="text-[#031635]">Edit with Voice</strong>.
        </p>
      </main>

      {/* Senior Double-Tap Request & Booking Confirmation Modal */}
      {isRequestModalOpen && (
        <ProviderRequestPanel
          requests={incomingRequests}
          onRespond={handleRespondBooking}
          onClose={() => setIsRequestModalOpen(false)}
        />
      )}
    </div>
  );
}
