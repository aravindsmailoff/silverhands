'use client';

import React, { useEffect, useRef } from 'react';
import { LocationCoordinates, NearbyUserPayload } from '@/lib/location-protocol';
import 'leaflet/dist/leaflet.css';

interface NearbyMapProps {
  userCoords: LocationCoordinates | null;
  nearbyUsers: NearbyUserPayload[];
  radiusMeters: number;
  sharingEnabled: boolean;
  selectedUserId: string | null;
  onSelectUser: (user: NearbyUserPayload | null) => void;
  centerTrigger: number;
}

function getServiceCategoryEmoji(skillOrService?: string): string {
  if (!skillOrService) return '👵🏽';
  const s = skillOrService.toLowerCase();
  if (s.includes('cook') || s.includes('food') || s.includes('baking') || s.includes('biryani') || s.includes('pickle')) return '🍳';
  if (s.includes('pot') || s.includes('clay') || s.includes('ceramic') || s.includes('sculpt')) return '🏺';
  if (s.includes('tailor') || s.includes('stitch') || s.includes('cloth') || s.includes('sew') || s.includes('embroidery')) return '🧵';
  if (s.includes('music') || s.includes('sing') || s.includes('veena') || s.includes('carnatic') || s.includes('guitar')) return '🎵';
  if (s.includes('garden') || s.includes('plant') || s.includes('farm') || s.includes('soil')) return '🌿';
  if (s.includes('paint') || s.includes('tanjore') || s.includes('draw') || s.includes('art')) return '🎨';
  if (s.includes('yoga') || s.includes('wellness') || s.includes('fitness')) return '🧘🏽';
  if (s.includes('teach') || s.includes('tutor') || s.includes('class') || s.includes('lesson')) return '🎓';
  if (s.includes('repair') || s.includes('fix') || s.includes('plumb')) return '🔧';
  return '👵🏽';
}

export default function NearbyMap({
  userCoords,
  nearbyUsers,
  radiusMeters,
  sharingEnabled,
  selectedUserId,
  onSelectUser,
  centerTrigger,
}: NearbyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const accuracyCircleRef = useRef<any>(null);
  const geofenceCircleRef = useRef<any>(null);
  const nearbyMarkersMapRef = useRef<Map<string, any>>(new Map());
  const isInitialCenteringRef = useRef<boolean>(false);

  // Initialize Map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;

    let L: any;
    try {
      L = require('leaflet');
    } catch {
      return;
    }

    if (!mapInstanceRef.current) {
      const defaultLat = userCoords?.latitude || 13.0827;
      const defaultLng = userCoords?.longitude || 80.2707;

      const map = L.map(mapContainerRef.current, {
        center: [defaultLat, defaultLng],
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Current User Marker & Geofence Circle
  useEffect(() => {
    if (!mapInstanceRef.current || !userCoords) return;

    const L = require('leaflet');
    const map = mapInstanceRef.current;
    const latLng = [userCoords.latitude, userCoords.longitude];

    if (!isInitialCenteringRef.current) {
      map.setView(latLng, 14, { animate: true });
      isInitialCenteringRef.current = true;
    }

    // 1. User Marker (YOU)
    const userIconHtml = `
      <div class="relative flex items-center justify-center">
        <div class="w-11 h-11 rounded-full bg-[#031635] text-[#FDBC13] border-3 border-white shadow-2xl flex items-center justify-center font-black text-xs relative z-10 animate-bounce">
          YOU
        </div>
        <div class="absolute w-14 h-14 rounded-full bg-[#031635]/30 animate-ping"></div>
      </div>
    `;

    const customUserIcon = L.divIcon({
      html: userIconHtml,
      className: 'custom-user-marker',
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker(latLng, { icon: customUserIcon, zIndexOffset: 1000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(latLng);
    }

    // 2. GPS Accuracy Circle
    if (userCoords.accuracy > 0) {
      if (!accuracyCircleRef.current) {
        accuracyCircleRef.current = L.circle(latLng, {
          radius: userCoords.accuracy,
          color: '#3B82F6',
          fillColor: '#60A5FA',
          fillOpacity: 0.12,
          weight: 1,
          dashArray: '4, 4',
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng(latLng);
        accuracyCircleRef.current.setRadius(userCoords.accuracy);
      }
    }

    // 3. Geofence Radius Circle
    if (!geofenceCircleRef.current) {
      geofenceCircleRef.current = L.circle(latLng, {
        radius: radiusMeters,
        color: '#FDBC13',
        fillColor: '#FDBC13',
        fillOpacity: 0.06,
        weight: 2,
      }).addTo(map);
    } else {
      geofenceCircleRef.current.setLatLng(latLng);
      geofenceCircleRef.current.setRadius(radiusMeters);
    }
  }, [userCoords, radiusMeters]);

  // Center on Me trigger
  useEffect(() => {
    if (centerTrigger > 0 && mapInstanceRef.current && userCoords) {
      mapInstanceRef.current.setView([userCoords.latitude, userCoords.longitude], 15, {
        animate: true,
      });
    }
  }, [centerTrigger, userCoords]);

  // Update Nearby Service Provider Markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const L = require('leaflet');
    const map = mapInstanceRef.current;
    const currentNearbyIds = new Set<string>();

    for (const u of nearbyUsers) {
      currentNearbyIds.add(u.userId);
      const latLng = [u.latitude, u.longitude];
      const isSelected = selectedUserId === u.userId;
      const isSenior = u.role === 'senior';

      const primaryService = (u.services && u.services[0]) || u.skill || (isSenior ? 'Craft & Service' : 'Learner');
      const emoji = getServiceCategoryEmoji(primaryService);
      const distFormatted = u.distanceMeters < 1000 ? `${Math.round(u.distanceMeters)}m` : `${(u.distanceMeters / 1000).toFixed(1)}km`;

      const markerHtml = `
        <div class="relative flex flex-col items-center cursor-pointer transition-transform hover:scale-110">
          <div class="px-2.5 py-1 ${isSenior ? 'bg-emerald-800 text-emerald-100' : 'bg-[#031635] text-white'} text-[11px] font-black rounded-lg shadow-lg whitespace-nowrap mb-1 border border-white/30 flex items-center gap-1">
            <span class="w-2 h-2 rounded-full ${isSenior ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}"></span>
            <span>${primaryService}</span>
            <span class="text-amber-300 font-extrabold">• ${distFormatted}</span>
          </div>
          <div class="w-10 h-10 rounded-2xl ${
            isSelected
              ? 'bg-purple-600 ring-4 ring-purple-300 scale-110'
              : isSenior
              ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
              : 'bg-slate-700'
          } text-white border-2 border-white shadow-xl flex items-center justify-center text-lg">
            ${emoji}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-nearby-marker',
        iconSize: [44, 56],
        iconAnchor: [22, 50],
      });

      const existingMarker = nearbyMarkersMapRef.current.get(u.userId);
      if (existingMarker) {
        existingMarker.setLatLng(latLng);
        existingMarker.setIcon(customIcon);
      } else {
        const newMarker = L.marker(latLng, { icon: customIcon }).addTo(map);
        newMarker.on('click', () => {
          onSelectUser(u);
        });
        nearbyMarkersMapRef.current.set(u.userId, newMarker);
      }
    }

    // Remove markers that are no longer present
    for (const [uid, marker] of Array.from(nearbyMarkersMapRef.current.entries())) {
      if (!currentNearbyIds.has(uid)) {
        map.removeLayer(marker);
        nearbyMarkersMapRef.current.delete(uid);
      }
    }
  }, [nearbyUsers, selectedUserId, onSelectUser]);

  return (
    <div className="w-full h-full relative rounded-3xl overflow-hidden shadow-xl border-2 border-[#E3E2E0]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      {!userCoords && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-10 flex items-center justify-center p-6 text-center text-white">
          <div className="space-y-3 max-w-sm">
            <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center mx-auto animate-pulse text-2xl">
              📍
            </div>
            <h3 className="font-extrabold text-lg">Acquiring High-Precision GPS...</h3>
            <p className="text-xs text-slate-300">Please enable browser location access to view live nearby SilverHands service providers on the radar.</p>
          </div>
        </div>
      )}
    </div>
  );
}
