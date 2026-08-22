'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useDeviceLocation } from '@/lib/hooks/useDeviceLocation';
import { useRealtimeLocation } from '@/lib/hooks/useRealtimeLocation';
import { NearbyUserPayload, ServiceRequestPayload } from '@/lib/location-protocol';
import LocationControls from '@/components/nearby/LocationControls';
import NearbyUserCard from '@/components/nearby/NearbyUserCard';
import ProviderRequestPanel from '@/components/nearby/ProviderRequestPanel';
import {
  Radio, MapPin, ArrowLeft, ShieldCheck, Sparkles,
  Crosshair, Users, AlertCircle, RefreshCw, Bell
} from 'lucide-react';

import { resolveActiveSession, ActiveSessionInfo } from '@/lib/session-resolver';

// Dynamically import Leaflet Map to ensure SSR safety in Next.js
const NearbyMap = dynamic(() => import('@/components/nearby/NearbyMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-3xl flex items-center justify-center p-8 text-center">
      <div className="space-y-3">
        <div className="w-12 h-12 rounded-full bg-[#D8E2FF] text-[#031635] flex items-center justify-center mx-auto animate-pulse text-2xl">
          🗺️
        </div>
        <div className="font-extrabold text-[#031635] text-base">Loading Interactive Map Engine...</div>
        <div className="text-xs text-[#75777F]">Initializing geospatial render pipeline</div>
      </div>
    </div>
  ),
});

export default function NearbyLiveLocationPage() {
  const [sharingEnabled, setSharingEnabled] = useState<boolean>(true);
  const [radiusMeters, setRadiusMeters] = useState<number>(2000);
  const [selectedUser, setSelectedUser] = useState<NearbyUserPayload | null>(null);
  const [centerTrigger, setCenterTrigger] = useState<number>(0);
  const [isProviderPanelOpen, setIsProviderPanelOpen] = useState<boolean>(false);
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo>({
    userId: 'usr_guest',
    displayName: 'Guest',
    role: 'consumer',
    skill: 'Learner',
    services: [],
  });

  // Re-resolve active session on mount and when hash/search changes
  useEffect(() => {
    const updateSession = () => {
      setActiveSession(resolveActiveSession());
    };
    updateSession();
    window.addEventListener('popstate', updateSession);
    return () => window.removeEventListener('popstate', updateSession);
  }, []);

  // 1. Device GPS Stream Hook
  const {
    coordinates,
    permissionStatus,
    error: gpsError,
    startWatching,
  } = useDeviceLocation(true);

  // 2. Realtime WebSocket Transport Hook
  const {
    connectionState,
    nearbyUsers,
    activeNearbyCount,
    errorMessage: wsError,
    incomingRequests,
    sentRequests,
    unreadRequestCount,
    reconnectNow,
    sendServiceRequest,
    respondServiceRequest,
    markRequestsRead,
  } = useRealtimeLocation({
    coordinates,
    sharingEnabled,
    radiusMeters,
  });

  const handleSwitchRole = (newRole: 'consumer' | 'senior') => {
    try {
      localStorage.setItem('silverhands_active_role', newRole);
    } catch (e) {}
    const updated = resolveActiveSession();
    setActiveSession(updated);
    setSelectedUser(null);
    reconnectNow();
  };

  const handleCenterOnMe = () => {
    setCenterTrigger((prev) => prev + 1);
  };

  const handleOpenProviderPanel = () => {
    markRequestsRead();
    setIsProviderPanelOpen(true);
  };

  // ✅ When a service is posted/toggled from the dashboard,
  // reconnect the WebSocket so AUTHENTICATE re-runs with the fresh services array
  useEffect(() => {
    const handleServicesUpdated = () => {
      reconnectNow();
    };
    window.addEventListener('silverhands:services-updated', handleServicesUpdated);
    return () => window.removeEventListener('silverhands:services-updated', handleServicesUpdated);
  }, [reconnectNow]);

  // Find if there is an active request with the currently selected provider
  const activeRequestWithSelected = selectedUser
    ? sentRequests.find((r) => r.providerId === selectedUser.userId)
    : null;

  // Filter nearby users strictly: exclude self, and only show target opposite role
  const displayedNearbyUsers = nearbyUsers.filter(
    (u) => u.userId !== activeSession.userId && u.role !== activeSession.role
  );

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] flex flex-col antialiased">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                🤝
              </div>
              <div>
                <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
                <span className="text-xs font-semibold text-[#44474E] tracking-widest uppercase block -mt-1">
                  {activeSession.role === 'consumer' ? 'Consumer Radar' : 'Provider Radar'}
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1 bg-[#F4F3F1] p-1.5 rounded-full border border-[#E3E2E0]">
              <Link href="/consumer/dashboard" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Marketplace
              </Link>
              <Link href="/dashboard" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                My Home
              </Link>
              <Link
                href={activeSession.role === 'consumer' ? '/nearby?role=consumer' : '/nearby?role=senior'}
                className="px-5 py-2 rounded-full bg-[#031635] text-[#FDBC13] font-bold text-sm shadow-sm"
              >
                📍 People Near Me
              </Link>
            </nav>
          </div>

          {/* Mode Switcher + Notifications + Back */}
          <div className="flex items-center gap-3">
            {/* Direct Perspective Switcher */}
            <div className="flex items-center bg-[#EFEEEB] p-1 rounded-2xl border border-[#E3E2E0]">
              <Link
                href="/nearby?role=consumer"
                onClick={() => handleSwitchRole('consumer')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  activeSession.role === 'consumer'
                    ? 'bg-[#031635] text-[#FDBC13] shadow-sm'
                    : 'text-[#44474E] hover:text-black'
                }`}
              >
                <span>🛒</span>
                <span>Consumer View</span>
              </Link>
              <Link
                href="/nearby?role=senior"
                onClick={() => handleSwitchRole('senior')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  activeSession.role === 'senior'
                    ? 'bg-[#031635] text-[#FDBC13] shadow-sm'
                    : 'text-[#44474E] hover:text-black'
                }`}
              >
                <span>👵🏽</span>
                <span>Senior View</span>
              </Link>
            </div>

            {/* People Need My Help — Request Notification Bell (for Senior) */}
            {activeSession.role === 'senior' && (
              <button
                onClick={handleOpenProviderPanel}
                className="relative p-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-2xl transition flex items-center gap-2 text-sm font-extrabold shadow-sm"
                title="People who need your help"
              >
                <Bell className="w-5 h-5 text-amber-700" />
                <span className="hidden sm:inline">People Need My Help</span>
                {incomingRequests.filter(r => r.status === 'REQUESTED').length > 0 && (
                  <span className="w-6 h-6 rounded-full bg-rose-600 text-white font-black text-xs flex items-center justify-center animate-bounce">
                    {incomingRequests.filter(r => r.status === 'REQUESTED').length}
                  </span>
                )}
              </button>
            )}

            <Link
              href={activeSession.role === 'senior' ? '/dashboard' : '/consumer/dashboard'}
              className="flex items-center gap-2 px-4 py-2 bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] text-xs font-extrabold rounded-2xl transition border border-[#E3E2E0]"
            >
              <ArrowLeft className="w-4 h-4" /> {activeSession.role === 'senior' ? 'Back to Home' : 'Back to Marketplace'}
            </Link>
          </div>
        </div>
      </header>

      {/* Main Realtime Radar Workspace */}
      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 sm:px-6 lg:px-12 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Interactive Map Viewport (8 Cols) */}
        <div className="lg:col-span-8 h-[600px] lg:h-[760px] w-full relative">
          <NearbyMap
            userCoords={coordinates}
            nearbyUsers={displayedNearbyUsers}
            radiusMeters={radiusMeters}
            sharingEnabled={sharingEnabled}
            selectedUserId={selectedUser?.userId || null}
            onSelectUser={(u) => setSelectedUser(u)}
            centerTrigger={centerTrigger}
          />

          {/* Floating Selected Provider Service Panel on Bottom of Map */}
          {selectedUser && (
            <div className="absolute bottom-6 left-6 z-20">
              <NearbyUserCard
                user={selectedUser}
                onClose={() => setSelectedUser(null)}
                onRequestService={sendServiceRequest}
                activeRequest={activeRequestWithSelected}
              />
            </div>
          )}
        </div>

        {/* Right Side: Location Controls & Realtime Service Deck (4 Cols) */}
        <div className="lg:col-span-4 space-y-6">
          <LocationControls
            sharingEnabled={sharingEnabled}
            onToggleSharing={(en) => setSharingEnabled(en)}
            radiusMeters={radiusMeters}
            onSelectRadius={(r) => setRadiusMeters(r)}
            connectionState={connectionState}
            gpsAccuracy={coordinates?.accuracy ?? null}
            activeNearbyCount={displayedNearbyUsers.length}
            onCenterOnMe={handleCenterOnMe}
            reconnectNow={reconnectNow}
            errorMessage={gpsError || wsError}
          />

          {/* People Near Me — Live Feed */}
          <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#031635] flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-600" />
                  {activeSession.role === 'consumer' ? 'Senior Providers Near Me' : 'People Near Me'}
                </h3>
                <span className="text-[11px] font-semibold text-[#75777F] block mt-0.5">
                  {activeSession.role === 'consumer'
                    ? 'Verified senior artisans & service providers near you'
                    : 'People nearby who may need your services'}
                </span>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                {displayedNearbyUsers.length} nearby
              </span>
            </div>

            {displayedNearbyUsers.length === 0 ? (
              <div className="text-center py-8 text-sm text-[#75777F] space-y-2">
                <div className="w-10 h-10 bg-[#F4F3F1] rounded-full flex items-center justify-center mx-auto text-lg">
                  🔍
                </div>
                <div className="font-extrabold text-[#031635]">
                  {activeSession.role === 'consumer' ? 'No senior providers nearby' : 'No consumers asking for help nearby'}
                </div>
                <p>
                  {activeSession.role === 'consumer'
                    ? `When senior providers share their location within ${
                        radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`
                      }, they will appear here.`
                    : `When people near you ask for assistance within ${
                        radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`
                      }, they will appear here.`}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                {displayedNearbyUsers.map((u) => {
                  const isSelected = selectedUser?.userId === u.userId;
                  const isSenior = u.role === 'senior';
                  const distLabel =
                    u.distanceMeters < 1000
                      ? `${Math.round(u.distanceMeters)} m away`
                      : `${(u.distanceMeters / 1000).toFixed(1)} km away`;
                  const primaryService = (u.services && u.services[0]) || u.skill || (isSenior ? 'Can help with crafts' : 'Consumer');

                  return (
                    <div
                      key={u.userId}
                      onClick={() => setSelectedUser(u)}
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between ${isSelected
                          ? 'bg-emerald-50 border-emerald-400 shadow-sm ring-2 ring-emerald-200'
                          : 'bg-[#FAF9F6] border-[#E3E2E0] hover:bg-white'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#031635] to-[#0a2f68] text-[#FDBC13] flex items-center justify-center text-lg font-black shadow">
                          {isSenior ? '👵🏽' : '👤'}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-[#031635]">{u.displayName}</h4>
                          <span className="text-xs text-emerald-800 font-extrabold block">
                            {isSenior ? '🍳 ' : '👤 '}{isSenior ? primaryService : 'Consumer'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="block font-black text-sm text-emerald-700">{distLabel}</span>
                        <span className="text-[9px] font-bold text-slate-400">±{u.accuracy}m</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Provider Incoming Requests Drawer Modal */}
      {isProviderPanelOpen && (
        <ProviderRequestPanel
          requests={incomingRequests}
          onRespond={respondServiceRequest}
          onClose={() => setIsProviderPanelOpen(false)}
        />
      )}
    </div>
  );
}
