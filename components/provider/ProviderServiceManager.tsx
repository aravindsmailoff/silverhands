'use client';

import React, { useState, useEffect, useRef } from 'react';
import { getSavedProfile, saveProfileState, getAccountsRegistry, saveAccountsRegistry, normalizeUserName } from '@/lib/voice-agent';
import { authService } from '@/lib/auth-service';
import { localDB } from '@/lib/local-db';
import {
  Plus, MapPin, Trash2, CheckCircle2,
  Video, Home, Globe, X, Loader2
} from 'lucide-react';

// ── Internal types (unchanged — only UI labels change) ─────────────────────
export interface ProviderServiceItem {
  id: string;
  title: string;
  category: 'cooking' | 'pottery' | 'tailoring' | 'music' | 'gardening' | 'repair' | 'lessons' | 'other';
  deliveryType: 'HOME_SERVICE' | 'IN_PERSON_WORKSHOP' | 'ONLINE_CLASS' | 'CONSULTATION';
  pricing: string;
  duration: string;
  locality: string;
  coverageRadiusKm: number;
  availability: string;
  description: string;
  status: 'ACTIVE' | 'PAUSED';
  // GPS coordinates stored internally — never shown to senior
  lat?: number;
  lng?: number;
}

// ── Friendly labels for delivery types ─────────────────────────────────────
const DELIVERY_LABELS: Record<ProviderServiceItem['deliveryType'], { label: string; icon: React.ReactNode }> = {
  HOME_SERVICE:       { label: 'At their place',      icon: <Home  className="w-4 h-4" /> },
  ONLINE_CLASS:       { label: 'Online',               icon: <Video className="w-4 h-4" /> },
  IN_PERSON_WORKSHOP: { label: 'At my place',          icon: <Home  className="w-4 h-4" /> },
  CONSULTATION:       { label: 'Online or in person',  icon: <Globe className="w-4 h-4" /> },
};

// ── Friendly category emojis ────────────────────────────────────────────────
const CATEGORY_EMOJI: Record<ProviderServiceItem['category'], string> = {
  cooking:   '🍳',
  pottery:   '🏺',
  tailoring: '🧵',
  music:     '🎵',
  gardening: '🌱',
  repair:    '🔧',
  lessons:   '📚',
  other:     '⭐',
};

const DEFAULT_SERVICES: ProviderServiceItem[] = [
  {
    id: 'svc-1',
    title: 'Authentic Chettinad Home Cooking',
    category: 'cooking',
    deliveryType: 'HOME_SERVICE',
    pricing: '₹1,200 / visit',
    duration: '2.5 hours',
    locality: 'Your area',
    coverageRadiusKm: 5,
    availability: 'Weekdays 10 AM - 6 PM',
    description: 'Fresh homemade meals, authentic spice blending, vegetarian and traditional recipes at your kitchen.',
    status: 'ACTIVE'
  },
  {
    id: 'svc-2',
    title: '1-on-1 Tamil Cooking & Secret Recipe Masterclass',
    category: 'cooking',
    deliveryType: 'ONLINE_CLASS',
    pricing: '₹500 / session',
    duration: '90 minutes',
    locality: 'Online / Live Video',
    coverageRadiusKm: 0,
    availability: 'Saturdays 10 AM - 12 PM',
    description: 'Interactive live video lesson teaching traditional rasam, sambar, and festival sweets step-by-step.',
    status: 'ACTIVE'
  },
  {
    id: 'svc-3',
    title: 'Traditional Saree Alteration & Fall Stitching',
    category: 'tailoring',
    deliveryType: 'HOME_SERVICE',
    pricing: '₹600 / item',
    duration: '1.5 hours',
    locality: 'Your area',
    coverageRadiusKm: 3,
    availability: 'Mon - Thu 2 PM - 7 PM',
    description: 'Custom sleeve fitting, blouse alterations, and traditional border/fall stitching with 30 years experience.',
    status: 'ACTIVE'
  }
];

// ── Reverse-geocode via OpenStreetMap Nominatim (no API key required) ───────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'SilverHands/1.0' } }
    );
    if (!res.ok) return 'Your area';
    const data = await res.json();
    const a = data.address || {};
    // Build a human-readable neighbourhood name:
    // suburb / neighbourhood / quarter / village / town / city_district / city
    const locality =
      a.suburb ||
      a.neighbourhood ||
      a.quarter ||
      a.village ||
      a.town ||
      a.city_district ||
      a.county ||
      a.city ||
      'Your area';
    const city = a.city || a.town || a.county || '';
    return city && city !== locality ? `${locality}, ${city}` : locality;
  } catch {
    return 'Your area';
  }
}

export default function ProviderServiceManager() {
  const [services, setServices] = useState<ProviderServiceItem[]>(DEFAULT_SERVICES);
  const [defaultRadius, setDefaultRadius] = useState<number>(5);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Live GPS state — actual device position
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [liveLocality, setLiveLocality] = useState<string>('');
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'fetching' | 'found' | 'error'>('idle');
  const gpsWatchRef = useRef<number | null>(null);

  // Form State (internal field names unchanged)
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<ProviderServiceItem['category']>('cooking');
  const [formDeliveryType, setFormDeliveryType] = useState<ProviderServiceItem['deliveryType']>('HOME_SERVICE');
  const [formPricing, setFormPricing] = useState('₹800');
  const [formDuration, setFormDuration] = useState('2 hours');
  const [formAvailability, setFormAvailability] = useState('Daily 10 AM - 6 PM');
  const [formDescription, setFormDescription] = useState('');

  // ── Load saved services on mount ──────────────────────────────────────────
  useEffect(() => {
    const profile = getSavedProfile();
    if (profile?.services && Array.isArray(profile.services) && profile.services.length > 0) {
      try {
        const stored = localStorage.getItem('silverhands_provider_services');
        if (stored) setServices(JSON.parse(stored));
      } catch (e) {}
    }
  }, []);

  // ── Automatically get GPS on mount ────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setGpsStatus('error');
      return;
    }

    setGpsStatus('fetching');

    const onSuccess = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setLiveCoords({ lat, lng });

      // Reverse geocode to get a human-readable name
      const name = await reverseGeocode(lat, lng);
      setLiveLocality(name);
      setGpsStatus('found');

      // Also persist the real location into the profile
      const profile = getSavedProfile();
      if (profile) {
        profile.location = name;
        saveProfileState(profile);
      }

      // Auto-publish all active services to shared backend with live GPS
      try {
        const stored = localStorage.getItem('silverhands_provider_services');
        if (stored) {
          const parsed = JSON.parse(stored);
          const backendBase = process.env.NEXT_PUBLIC_API_BACKEND_URL || 'http://localhost:8000';
          for (const item of parsed.filter((s: any) => s.status === 'ACTIVE')) {
            fetch(`${backendBase}/api/services/publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serviceId: item.id,
                providerId: 'usr_prov_lakshmi_ammal',
                providerName: profile?.name || 'Lakshmi Ammal',
                serviceName: item.title,
                category: item.category,
                description: item.description,
                deliveryType: item.deliveryType,
                pricing: item.pricing,
                duration: item.duration,
                availability: item.availability,
                status: 'PUBLISHED',
                latitude: lat,
                longitude: lng,
                accuracy: 10.0,
                locality: name || 'Mogappair East, Chennai',
              }),
            }).catch(() => {});
          }
        }
      } catch (e) {}
    };

    const onError = () => {
      setGpsStatus('error');
      // Fall back to profile location if stored
      const profile = getSavedProfile();
      if (profile?.location) setLiveLocality(profile.location);
    };

    // Quick one-shot fetch first, then watch
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    gpsWatchRef.current = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 30000,
    });

    return () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }
    };
  }, []);

  // ── Persist services to localStorage + IndexedDB + profile ──────────────
  const saveServicesToStorage = async (updated: ProviderServiceItem[]) => {
    setServices(updated);
    const activeServiceTitles = updated.filter(s => s.status === 'ACTIVE').map(s => s.title);

    try {
      // 1. localStorage (for UI reads within same page)
      localStorage.setItem('silverhands_provider_services', JSON.stringify(updated));

      // 2. voice-agent profile (localStorage registry)
      const profile = getSavedProfile() || {
        name: 'Lakshmi Ammal', skill: 'Cooking', experience_years: 35,
        location: liveLocality || 'Your area', language: 'Tamil', services: [], availability: null
      };
      profile.services = activeServiceTitles;
      if (liveLocality) profile.location = liveLocality;
      saveProfileState(profile);

      const registry = getAccountsRegistry();
      const userKey = normalizeUserName(profile.name || 'Lakshmi Ammal');
      if (registry[userKey]) {
        registry[userKey].profile.services = activeServiceTitles;
        if (liveLocality) registry[userKey].profile.location = liveLocality;
        saveAccountsRegistry(registry);
      }

      // 3. ✅ Write directly to IndexedDB (DBCreatorProfile)
      //    This is what authService.getActiveProfile() reads —
      //    so the WebSocket AUTHENTICATE message picks up the new services.
      const session = await authService.initSession();
      if (session) {
        const existing = await localDB.getByIndex('profiles', 'userId', session.userId);
        const dbProfile = existing[0];
        if (dbProfile) {
          const updated_profile = {
            ...dbProfile,
            services: activeServiceTitles,
            ...(liveLocality ? { location: liveLocality } : {}),
            ...(liveCoords  ? { lat: liveCoords.lat, lng: liveCoords.lng } : {}),
            updatedAt: new Date().toISOString(),
          };
          await localDB.put('profiles', updated_profile);
        }
      }

      // 4. 🔔 Notify nearby page to reconnect WebSocket with fresh services
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('silverhands:services-updated'));
      }

      // 5. 🌐 Authoritative Shared Backend Publishing (Cross-Browser Discovery)
      const backendBase = process.env.NEXT_PUBLIC_API_BACKEND_URL || 'http://localhost:8000';
      const provId = session?.userId || 'usr_prov_lakshmi_ammal';
      const provDisplayName = profile.name || 'Lakshmi Ammal';

      for (const item of updated.filter((s) => s.status === 'ACTIVE')) {
        try {
          fetch(`${backendBase}/api/services/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serviceId: item.id,
              providerId: provId,
              providerName: provDisplayName,
              serviceName: item.title,
              category: item.category,
              description: item.description,
              deliveryType: item.deliveryType,
              pricing: item.pricing,
              duration: item.duration,
              availability: item.availability,
              status: 'PUBLISHED',
              latitude: item.lat || liveCoords?.lat || 13.0827,
              longitude: item.lng || liveCoords?.lng || 80.2707,
              accuracy: 10.0,
              locality: item.locality || liveLocality || 'Mylapore, Chennai',
            }),
          }).catch((err) => console.warn('[ServiceManager] Background publish notice:', err));
        } catch (e) {
          // ignore network failure in offline mode
        }
      }
    } catch (e) {
      console.warn('[ServiceManager] Error saving services:', e);
    }
  };

  // ── Post service handler ──────────────────────────────────────────────────
  const handlePostService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const isOnline = formDeliveryType === 'ONLINE_CLASS';
    const locality = isOnline ? 'Online / Live Video' : (liveLocality || 'Your area');

    const newItem: ProviderServiceItem = {
      id: `svc-${Date.now()}`,
      title: formTitle.trim(),
      category: formCategory,
      deliveryType: formDeliveryType,
      pricing: formPricing || '₹800',
      duration: formDuration || '2 hours',
      locality,
      coverageRadiusKm: isOnline ? 0 : defaultRadius,
      availability: formAvailability || 'Weekdays 10 AM - 6 PM',
      description: formDescription || 'Quality traditional craftsmanship and dedicated service.',
      status: 'ACTIVE',
      lat: isOnline ? undefined : (liveCoords?.lat ?? undefined),
      lng: isOnline ? undefined : (liveCoords?.lng ?? undefined),
    };

    const updated = [newItem, ...services];
    await saveServicesToStorage(updated);
    setIsModalOpen(false);
    setNotification(`✓ "${newItem.title}" is now being shared with people nearby!`);
    setTimeout(() => setNotification(null), 5000);

    setFormTitle('');
    setFormDescription('');
  };

  const toggleServiceStatus = async (id: string) => {
    const updated = services.map(s =>
      s.id === id
        ? { ...s, status: (s.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE') as 'ACTIVE' | 'PAUSED' }
        : s
    );
    await saveServicesToStorage(updated);
  };

  const deleteService = async (id: string) => {
    await saveServicesToStorage(services.filter(s => s.id !== id));
  };

  // ── Re-fetch GPS on demand ────────────────────────────────────────────────
  const handleRefreshLocation = () => {
    if (!('geolocation' in navigator)) return;
    setGpsStatus('fetching');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLiveCoords({ lat, lng });
        const name = await reverseGeocode(lat, lng);
        setLiveLocality(name);
        setGpsStatus('found');
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-6">

      {/* Notification Banner */}
      {notification && (
        <div className="p-5 bg-emerald-50 border-2 border-emerald-300 rounded-3xl text-lg text-emerald-900 font-bold flex items-center gap-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-600 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Live Location Banner */}
      <div className={`rounded-3xl p-5 border-2 flex items-center gap-4 ${
        gpsStatus === 'found'    ? 'bg-emerald-50 border-emerald-300' :
        gpsStatus === 'fetching' ? 'bg-amber-50  border-amber-300 animate-pulse' :
        gpsStatus === 'error'    ? 'bg-rose-50   border-rose-300' :
                                   'bg-[#F4F3F1] border-[#E3E2E0]'
      }`}>
        <span className="text-4xl shrink-0">
          {gpsStatus === 'found'    ? '📍' :
           gpsStatus === 'fetching' ? '🔍' :
           gpsStatus === 'error'    ? '⚠️' : '📍'}
        </span>
        <div className="flex-1 min-w-0">
          {gpsStatus === 'fetching' && (
            <>
              <p className="text-lg font-black text-amber-800 flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Finding your location…
              </p>
              <p className="text-sm font-medium text-amber-700">Please wait a moment</p>
            </>
          )}
          {gpsStatus === 'found' && (
            <>
              <p className="text-lg font-black text-emerald-800">📍 We found your location</p>
              <p className="text-base font-bold text-emerald-900 truncate">{liveLocality}</p>
              <p className="text-sm font-medium text-emerald-700">Your work will be shown to people nearby.</p>
            </>
          )}
          {gpsStatus === 'error' && (
            <>
              <p className="text-lg font-black text-rose-800">Could not find your location</p>
              <p className="text-sm font-medium text-rose-700">
                Please allow location access in your browser, then tap below.
              </p>
              <button
                onClick={handleRefreshLocation}
                className="mt-2 px-4 py-2 bg-rose-600 text-white font-bold text-sm rounded-xl"
              >
                Try Again
              </button>
            </>
          )}
          {gpsStatus === 'idle' && (
            <p className="text-base font-semibold text-[#44474E]">Getting your location…</p>
          )}
        </div>
        {gpsStatus === 'found' && (
          <button
            onClick={handleRefreshLocation}
            className="shrink-0 p-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-800 transition text-xs font-bold"
            title="Refresh location"
          >
            🔄
          </button>
        )}
      </div>

      {/* Travel radius */}
      <div className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-5 shadow-sm space-y-3">
        <p className="text-lg font-black text-[#031635]">How far can you travel?</p>
        <div className="flex items-center gap-3 flex-wrap">
          {[1, 3, 5, 10].map((r) => (
            <button
              key={r}
              onClick={() => setDefaultRadius(r)}
              className={`px-5 py-3 text-base font-bold rounded-2xl border-2 transition ${
                defaultRadius === r
                  ? 'bg-[#031635] text-[#FDBC13] border-[#031635] shadow-sm'
                  : 'bg-white text-[#44474E] border-[#E3E2E0] hover:bg-slate-50'
              }`}
            >
              {r} km
            </button>
          ))}
        </div>
      </div>

      {/* Skills / Services List */}
      <div className="space-y-4">
        <h3 className="text-xl font-black text-[#031635]">
          Things you can help with ({services.filter(s => s.status === 'ACTIVE').length})
        </h3>

        <div className="space-y-3">
          {services.map((svc) => {
            const isActive = svc.status === 'ACTIVE';
            const emoji = CATEGORY_EMOJI[svc.category] || '⭐';
            const delivery = DELIVERY_LABELS[svc.deliveryType];

            return (
              <div
                key={svc.id}
                className={`border-2 rounded-3xl p-5 flex items-start gap-4 transition ${
                  isActive
                    ? 'bg-white border-[#E3E2E0] shadow-sm'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <span className="text-5xl shrink-0 mt-1">{emoji}</span>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-xl font-black text-[#031635] leading-snug">{svc.title}</h4>
                    <button
                      onClick={() => toggleServiceStatus(svc.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-xl text-sm font-bold border-2 transition ${
                        isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                          : 'bg-slate-100 text-slate-600 border-slate-300'
                      }`}
                    >
                      {isActive ? '● Shared' : '○ Hidden'}
                    </button>
                  </div>

                  <p className="text-base text-[#44474E] leading-relaxed line-clamp-2">{svc.description}</p>

                  <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
                    <span className="flex items-center gap-1.5 text-[#031635]">
                      {delivery.icon} {delivery.label}
                    </span>
                    <span className="text-emerald-800 font-bold">{svc.pricing}</span>
                    <span className="text-[#44474E]">{svc.availability}</span>
                  </div>
                </div>

                <button
                  onClick={() => deleteService(svc.id)}
                  className="shrink-0 p-2 text-slate-400 hover:text-rose-600 transition mt-1"
                  title="Remove this"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Something New Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="w-full py-5 bg-[#FDBC13] hover:bg-[#F3B20B] text-[#261900] text-xl font-black rounded-3xl shadow-md transition active:scale-[0.98] flex items-center justify-center gap-3"
      >
        <Plus className="w-7 h-7" /> Add Something New
      </button>

      {/* "Add Something New" Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white border-2 border-[#031635] rounded-3xl p-6 sm:p-8 shadow-2xl max-w-lg w-full space-y-5 max-h-[92vh] overflow-y-auto">

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-4">
              <h3 className="font-black text-2xl text-[#031635]">What can you help people with?</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-[#44474E] hover:text-black rounded-full hover:bg-slate-100 transition">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handlePostService} className="space-y-5">

              {/* Title */}
              <div>
                <label className="block text-lg font-bold text-[#031635] mb-2">I can help with…</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Tamil cooking, Saree stitching, Carnatic music…"
                  className="w-full p-4 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl text-lg font-semibold text-[#031635] focus:outline-none focus:border-[#031635]"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-lg font-bold text-[#031635] mb-2">What type of help is this?</label>
                <select
                  value={formCategory}
                  onChange={(e: any) => setFormCategory(e.target.value)}
                  className="w-full p-4 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl text-lg font-semibold text-[#031635] focus:outline-none"
                >
                  <option value="cooking">🍳 Cooking &amp; Food</option>
                  <option value="tailoring">🧵 Stitching &amp; Tailoring</option>
                  <option value="pottery">🏺 Pottery &amp; Clay Crafts</option>
                  <option value="music">🎵 Music &amp; Singing</option>
                  <option value="gardening">🌱 Gardening &amp; Plants</option>
                  <option value="repair">🔧 Repairs &amp; Fixing</option>
                  <option value="lessons">📚 Teaching &amp; Lessons</option>
                  <option value="other">⭐ Something Else</option>
                </select>
              </div>

              {/* How do you want to help? */}
              <div>
                <label className="block text-lg font-bold text-[#031635] mb-2">How do you want to help?</label>
                <div className="grid grid-cols-1 gap-3">
                  {(Object.keys(DELIVERY_LABELS) as ProviderServiceItem['deliveryType'][]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setFormDeliveryType(key)}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 text-left transition ${
                        formDeliveryType === key
                          ? 'bg-[#031635] text-white border-[#031635]'
                          : 'bg-[#FAF9F6] text-[#031635] border-[#E3E2E0] hover:border-[#031635]/50'
                      }`}
                    >
                      <span className={formDeliveryType === key ? 'text-[#FDBC13]' : ''}>
                        {DELIVERY_LABELS[key].icon}
                      </span>
                      <span className="text-lg font-bold">{DELIVERY_LABELS[key].label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-lg font-bold text-[#031635] mb-2">Tell people a little about it</label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. I teach traditional Tamil cooking with authentic spices and family recipes…"
                  className="w-full p-4 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl text-base font-medium text-[#031635] focus:outline-none focus:border-[#031635]"
                />
              </div>

              {/* Pricing + When free */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base font-bold text-[#44474E] mb-1.5">Your price</label>
                  <input
                    type="text"
                    value={formPricing}
                    onChange={(e) => setFormPricing(e.target.value)}
                    placeholder="e.g. ₹500 / hour"
                    className="w-full p-3.5 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl text-base font-semibold text-[#031635] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-base font-bold text-[#44474E] mb-1.5">When are you free?</label>
                  <input
                    type="text"
                    value={formAvailability}
                    onChange={(e) => setFormAvailability(e.target.value)}
                    placeholder="e.g. Weekdays 10 AM - 6 PM"
                    className="w-full p-3.5 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl text-base font-semibold text-[#031635] focus:outline-none"
                  />
                </div>
              </div>

              {/* Location — auto-filled from GPS, shown for non-online services */}
              {formDeliveryType !== 'ONLINE_CLASS' && (
                <div className={`rounded-2xl p-4 border-2 flex items-center gap-3 ${
                  gpsStatus === 'found'    ? 'bg-emerald-50 border-emerald-200' :
                  gpsStatus === 'fetching' ? 'bg-amber-50  border-amber-200 animate-pulse' :
                                             'bg-[#FAF9F6] border-[#E3E2E0]'
                }`}>
                  <MapPin className={`w-5 h-5 shrink-0 ${gpsStatus === 'found' ? 'text-emerald-600' : 'text-[#44474E]'}`} />
                  <div>
                    {gpsStatus === 'found' ? (
                      <>
                        <p className="text-base font-black text-emerald-800">📍 We found your location</p>
                        <p className="text-sm font-bold text-emerald-700">{liveLocality}</p>
                        <p className="text-xs text-emerald-600">People near this place will see your work.</p>
                      </>
                    ) : gpsStatus === 'fetching' ? (
                      <p className="text-base font-bold text-amber-800 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Finding your location…
                      </p>
                    ) : (
                      <>
                        <p className="text-base font-bold text-[#44474E]">Location not found</p>
                        <button type="button" onClick={handleRefreshLocation} className="text-sm font-bold text-emerald-700 underline">
                          Tap to try again
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Share My Work CTA */}
              <button
                type="submit"
                disabled={formDeliveryType !== 'ONLINE_CLASS' && gpsStatus === 'fetching'}
                className="w-full py-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xl rounded-3xl shadow-lg transition active:scale-[0.98]"
              >
                {gpsStatus === 'fetching' && formDeliveryType !== 'ONLINE_CLASS'
                  ? '🔍 Finding your location…'
                  : '📍 Share My Work'}
              </button>

              <p className="text-center text-sm text-[#75777F]">
                {formDeliveryType === 'ONLINE_CLASS'
                  ? 'Your work will be visible to everyone online.'
                  : 'Your work will be shown to people in your area.'}
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
