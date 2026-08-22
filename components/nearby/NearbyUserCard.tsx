'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { NearbyUserPayload, ServiceRequestPayload } from '@/lib/location-protocol';
import { User, MapPin, Award, ArrowRight, X, Clock, Navigation, Send, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';

interface NearbyUserCardProps {
  user: NearbyUserPayload | null;
  onClose: () => void;
  onRequestService: (params: {
    providerId: string;
    serviceName: string;
    preferredTime?: string;
    message?: string;
  }) => void;
  activeRequest?: ServiceRequestPayload | null;
}

export default function NearbyUserCard({
  user,
  onClose,
  onRequestService,
  activeRequest,
}: NearbyUserCardProps) {
  if (!user) return null;

  const isSenior = user.role === 'senior';
  const distanceFormatted =
    user.distanceMeters < 1000
      ? `${Math.round(user.distanceMeters)} meters away`
      : `${(user.distanceMeters / 1000).toFixed(2)} km away`;

  const availableServices =
    user.services && user.services.length > 0
      ? user.services
      : [user.skill || (isSenior ? 'Traditional Home Service' : 'Learner Inquiry')];

  const [selectedService, setSelectedService] = useState<string>(availableServices[0]);
  const [preferredTime, setPreferredTime] = useState<string>('Today at 6:00 PM');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [isRequestFormOpen, setIsRequestFormOpen] = useState<boolean>(false);

  const handleSend = () => {
    onRequestService({
      providerId: user.userId,
      serviceName: selectedService,
      preferredTime,
      message: customMessage || `Request for ${selectedService} from nearby radar.`,
    });
    setIsRequestFormOpen(false);
  };

  const isPending = activeRequest?.status === 'REQUESTED';
  const isAccepted = activeRequest?.status === 'ACCEPTED';
  const isRejected = activeRequest?.status === 'REJECTED';

  return (
    <div className="bg-white/95 backdrop-blur-lg border-2 border-[#031635] rounded-3xl p-6 shadow-2xl animate-fade-in flex flex-col justify-between max-w-md w-full relative">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-[#44474E] transition"
      >
        <X className="w-4 h-4" />
      </button>

      <div>
        {/* Provider Profile Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#031635] to-[#0a2f68] text-[#FDBC13] flex items-center justify-center text-3xl font-black shadow-lg">
            {isSenior ? '👵🏽' : '👤'}
          </div>
          <div>
            <h3 className="font-extrabold text-xl text-[#031635] leading-snug">
              {user.displayName}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                  isSenior
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-blue-100 text-blue-800 border border-blue-300'
                }`}
              >
                {isSenior ? 'Helps people nearby' : 'SilverHands Member'}
              </span>
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                <Navigation className="w-3 h-3" /> {distanceFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* Active Request Live Status Banner */}
        {activeRequest && (
          <div className="mb-4">
            {isPending && (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-1.5 animate-pulse">
                <div className="flex items-center gap-2 text-amber-800 font-extrabold text-sm">
                  <Clock className="w-4 h-4 text-amber-600 animate-spin" />
                  <span>Waiting for {user.displayName}&apos;s answer&hellip;</span>
                </div>
                <p className="text-sm text-amber-900 font-semibold">
                  You asked <strong>{user.displayName}</strong> for help with <em>{activeRequest.serviceName}</em>.
                </p>
              </div>
            )}

            {isAccepted && (
              <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-base">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>{user.displayName} agreed to help! ✓</span>
                </div>
                <p className="text-sm text-emerald-900 font-semibold">
                  <strong>{user.displayName}</strong> will help you with <em>{activeRequest.serviceName}</em>.
                </p>
                <Link
                  href={`/profile?username=${encodeURIComponent(user.displayName)}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-extrabold shadow-sm transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> Contact {user.displayName}
                </Link>
              </div>
            )}

            {isRejected && (
              <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-1.5">
                <div className="flex items-center gap-2 text-rose-800 font-extrabold text-sm">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Sorry, {user.displayName} isn&apos;t available this time.</span>
                </div>
                <p className="text-sm text-rose-900 font-semibold">
                  Try asking someone else nearby.
                </p>
              </div>
            )}
          </div>
        )}

        {/* If Senior Provider: Services Offered List */}
        {isSenior && !isRequestFormOpen && (
          <div className="space-y-3 bg-[#FAF9F6] p-4 rounded-2xl border border-[#E3E2E0] mb-4">
            <span className="block text-sm font-extrabold text-[#031635]">
              What {user.displayName} Can Do
            </span>
            <div className="flex flex-wrap gap-1.5">
              {availableServices.map((svc) => (
                <button
                  key={svc}
                  onClick={() => {
                    setSelectedService(svc);
                    setIsRequestFormOpen(true);
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-50 hover:border-emerald-400 border border-[#E3E2E0] rounded-xl text-xs font-extrabold text-[#031635] transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>🍳</span>
                  <span>{svc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* If Consumer: Consumer Info */}
        {!isSenior && (
          <div className="space-y-2 bg-[#FAF9F6] p-4 rounded-2xl border border-[#E3E2E0] mb-4">
            <span className="block text-sm font-extrabold text-[#031635]">
              Member Information
            </span>
            <p className="text-xs text-[#44474E] font-medium">
              Looking for verified nearby senior artisans and traditional service providers.
            </p>
          </div>
        )}

        {/* Request Service Form (Only when booking a senior provider) */}
        {isSenior && isRequestFormOpen && (
          <div className="space-y-4 bg-[#FAF9F6] p-5 rounded-2xl border border-[#E3E2E0] mb-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-3">
              <span className="font-extrabold text-sm text-[#031635]">What would you like {user.displayName} to help with?</span>
              <button onClick={() => setIsRequestFormOpen(false)} className="text-sm text-[#75777F] hover:text-black">
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#031635] mb-1.5">Choose what you need help with</label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full p-3 bg-white rounded-xl border border-[#E3E2E0] text-sm font-bold text-[#031635]"
              >
                {availableServices.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#031635] mb-1.5">When would you like help?</label>
              <input
                type="text"
                value={preferredTime}
                onChange={(e) => setPreferredTime(e.target.value)}
                placeholder="e.g. Today at 6:00 PM, Tomorrow morning"
                className="w-full p-3 bg-white rounded-xl border border-[#E3E2E0] text-sm font-bold text-[#031635]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[#031635] mb-1.5">Optional message (what do you need?)</label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="e.g. I need help preparing a special dinner for 4 people."
                rows={2}
                className="w-full p-3 bg-white rounded-xl border border-[#E3E2E0] text-sm font-medium text-[#031635]"
              />
            </div>

            <button
              onClick={handleSend}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md transition flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" /> Send Request
            </button>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center gap-2 pt-2">
        {!isRequestFormOpen && isSenior && (
          <button
            onClick={() => setIsRequestFormOpen(true)}
            className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-1.5"
          >
            <Send className="w-4 h-4" /> Ask for Help
          </button>
        )}

        <Link
          href={`/profile?username=${encodeURIComponent(user.displayName)}&userId=${encodeURIComponent(user.userId)}&role=${user.role}`}
          className="flex-1 py-4 bg-[#031635] hover:bg-[#08285c] text-white font-extrabold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-1.5"
        >
          <span>View Profile</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
