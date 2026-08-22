'use client';

import React from 'react';
import { ConnectionState } from '@/lib/hooks/useRealtimeLocation';
import {
  Radio, MapPin, Navigation, Shield, Sparkles,
  Crosshair, RefreshCw, AlertTriangle, CheckCircle2
} from 'lucide-react';

interface LocationControlsProps {
  sharingEnabled: boolean;
  onToggleSharing: (enabled: boolean) => void;
  radiusMeters: number;
  onSelectRadius: (radius: number) => void;
  connectionState: ConnectionState;
  gpsAccuracy: number | null;
  activeNearbyCount: number;
  onCenterOnMe: () => void;
  reconnectNow: () => void;
  errorMessage: string | null;
}

const RADIUS_OPTIONS = [
  { label: '500 m', value: 500 },
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
];

export default function LocationControls({
  sharingEnabled,
  onToggleSharing,
  radiusMeters,
  onSelectRadius,
  connectionState,
  gpsAccuracy,
  activeNearbyCount,
  onCenterOnMe,
  reconnectNow,
  errorMessage,
}: LocationControlsProps) {
  const isConnected = connectionState === 'CONNECTED';
  const isReconnecting = connectionState === 'RECONNECTING' || connectionState === 'CONNECTING';

  return (
    <div className="bg-white/95 backdrop-blur-md border-2 border-[#031635] rounded-3xl p-6 shadow-2xl space-y-5">
      {/* Header & Connection Indicator */}
      <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black text-xl shadow">
            📡
          </div>
          <div>
            <h2 className="text-lg font-black text-[#031635] tracking-tight">Realtime Location Hub</h2>
            <div className="flex items-center gap-2 text-[11px] font-bold">
              <span
                className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : isReconnecting ? 'bg-amber-500 animate-ping' : 'bg-rose-500'
                  }`}
              />
              <span className={isConnected ? 'text-emerald-700' : isReconnecting ? 'text-amber-700' : 'text-rose-700'}>
                {connectionState === 'CONNECTED' ? 'Realtime Connected' : connectionState === 'RECONNECTING' ? 'Reconnecting Gateway...' : connectionState}
              </span>
            </div>
          </div>
        </div>

        {/* Center on Me Action */}
        <button
          onClick={onCenterOnMe}
          className="p-2.5 bg-[#FAF9F6] hover:bg-[#F4F3F1] border border-[#E3E2E0] text-[#031635] rounded-2xl transition active:scale-95 flex items-center gap-1.5 text-xs font-extrabold shadow-sm"
          title="Center on my location"
        >
          <Crosshair className="w-4 h-4 text-purple-600" />
          <span className="hidden sm:inline">Center on Me</span>
        </button>
      </div>

      {/* Error / Alert notice */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-800 font-bold">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={reconnectNow} className="text-rose-900 underline hover:text-black shrink-0 ml-2">
            Retry
          </button>
        </div>
      )}

      {/* Explicit Location Sharing Switch */}
      <div className="flex items-center justify-between p-4 bg-[#FAF9F6] rounded-2xl border border-[#E3E2E0]">
        <div>
          <span className="block font-black text-sm text-[#031635]">Share My Live Location</span>
          <span className="block text-[11px] text-[#44474E] font-medium">
            {sharingEnabled ? 'Broadcasting live to verified nearby members' : 'Location hidden • Ghost mode active'}
          </span>
        </div>

        <button
          onClick={() => onToggleSharing(!sharingEnabled)}
          className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none shadow-inner ${sharingEnabled ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-md ${sharingEnabled ? 'translate-x-8' : 'translate-x-1'
              }`}
          />
        </button>
      </div>

      {/* Geofence Radius Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-extrabold text-[#031635]">
          <span className="flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-purple-600" /> Geofence Query Radius
          </span>
          <span className="text-[#44474E]">{radiusMeters >= 1000 ? `${radiusMeters / 1000} km` : `${radiusMeters} m`}</span>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {RADIUS_OPTIONS.map((opt) => {
            const isSelected = radiusMeters === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onSelectRadius(opt.value)}
                className={`py-2 px-1 text-xs font-extrabold rounded-xl transition border text-center ${isSelected
                    ? 'bg-[#031635] text-[#FDBC13] border-[#031635] shadow-md scale-102'
                    : 'bg-[#FAF9F6] text-[#44474E] border-[#E3E2E0] hover:bg-[#F4F3F1]'
                  }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Realtime Metrics Summary Deck */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="p-3.5 bg-[#FAF9F6] rounded-2xl border border-[#E3E2E0] text-center">
          <span className="block text-[10px] font-extrabold text-[#75777F] uppercase tracking-wider">Nearby in Radius</span>
          <span className="text-2xl font-black text-[#031635]">{activeNearbyCount}</span>
          <span className="block text-[10px] font-bold text-emerald-700">Members Live</span>
        </div>

        <div className="p-3.5 bg-[#FAF9F6] rounded-2xl border border-[#E3E2E0] text-center">
          <span className="block text-[10px] font-extrabold text-[#75777F] uppercase tracking-wider">GPS Precision</span>
          <span className="text-2xl font-black text-[#031635]">
            {gpsAccuracy !== null ? `±${gpsAccuracy}m` : 'Locking...'}
          </span>
          <span className="block text-[10px] font-bold text-purple-700">High Accuracy</span>
        </div>
      </div>
    </div>
  );
}
