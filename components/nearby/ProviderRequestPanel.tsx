'use client';

import React, { useState, useRef } from 'react';
import { ServiceRequestPayload } from '@/lib/location-protocol';
import { X } from 'lucide-react';

interface ProviderRequestPanelProps {
  requests: ServiceRequestPayload[];
  onRespond: (requestId: string, action: 'ACCEPT' | 'REJECT') => void;
  onClose: () => void;
}

// ── Per-request double-tap state ───────────────────────────────────────────
type TapState = 'IDLE' | 'FIRST_TAP' | 'CONFIRMED';
type RejectState = 'IDLE' | 'CONFIRMING';

// ── Friendly status labels (internal statuses stay unchanged) ──────────────
function friendlyStatus(status: ServiceRequestPayload['status']): { label: string; color: string } {
  switch (status) {
    case 'ACCEPTED':  return { label: 'You agreed to help',       color: 'text-emerald-700' };
    case 'REJECTED':  return { label: "You said you can't this time", color: 'text-slate-500' };
    case 'CANCELLED': return { label: 'Cancelled',                 color: 'text-slate-400' };
    default:          return { label: 'Waiting for your answer',   color: 'text-amber-700' };
  }
}

// ── Single request card with double-tap confirm ───────────────────────────
function RequestCard({
  req,
  onRespond,
}: {
  req: ServiceRequestPayload;
  onRespond: (requestId: string, action: 'ACCEPT' | 'REJECT') => void;
}) {
  const [tapState, setTapState] = useState<TapState>('IDLE');
  const [rejectState, setRejectState] = useState<RejectState>('IDLE');
  const tapResetRef = useRef<NodeJS.Timeout | null>(null);

  const isPending = req.status === 'REQUESTED';

  // ── Double-tap accept ──────────────────────────────────────────────────
  const handleAcceptTap = () => {
    if (tapState === 'IDLE') {
      setTapState('FIRST_TAP');
      // Auto-reset if no second tap within 5 seconds
      tapResetRef.current = setTimeout(() => setTapState('IDLE'), 5000);
    } else if (tapState === 'FIRST_TAP') {
      if (tapResetRef.current) clearTimeout(tapResetRef.current);
      setTapState('CONFIRMED');

      // Persist appointment to localStorage for dashboard "My Appointments" view
      try {
        const existing = JSON.parse(localStorage.getItem('silverhands_appointments') || '[]');
        existing.push({
          name: req.consumerName,
          service: req.serviceName,
          time: req.preferredTime || '',
          status: 'ACCEPTED',
        });
        localStorage.setItem('silverhands_appointments', JSON.stringify(existing));
      } catch (e) {}

      onRespond(req.id, 'ACCEPT');
    }
  };

  // ── Reject with simple confirmation ───────────────────────────────────
  const handleRejectFirst = () => setRejectState('CONFIRMING');
  const handleRejectConfirm = () => {
    setRejectState('IDLE');
    onRespond(req.id, 'REJECT');
  };

  // ── Non-pending (past) request display ─────────────────────────────────
  if (!isPending && req.status !== 'REQUESTED') {
    const { label, color } = friendlyStatus(req.status);
    if (req.status === 'CANCELLED') return null; // hide cancelled
    return (
      <div className="p-5 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-3xl flex items-center justify-between">
        <div>
          <p className="text-lg font-black text-[#031635]">{req.consumerName}</p>
          <p className="text-base text-[#44474E] font-semibold">{req.serviceName}</p>
        </div>
        <p className={`text-sm font-bold ${color}`}>{label}</p>
      </div>
    );
  }

  // ── CONFIRMED state: success screen ───────────────────────────────────
  if (tapState === 'CONFIRMED') {
    return (
      <div className="p-7 bg-emerald-50 border-2 border-emerald-400 rounded-3xl text-center space-y-4 shadow-sm">
        <div className="text-6xl">✓</div>
        <h3 className="text-2xl font-black text-emerald-800">Done!</h3>
        <p className="text-xl font-bold text-emerald-900">
          You agreed to help {req.consumerName}.
        </p>
        {req.preferredTime && (
          <p className="text-lg font-semibold text-emerald-700">{req.preferredTime}</p>
        )}
        <p className="text-base font-semibold text-emerald-700">
          {req.consumerName} has been informed. ❤️
        </p>
      </div>
    );
  }

  return (
    <div className="border-2 border-amber-300 bg-amber-50 rounded-3xl overflow-hidden shadow-sm">

      {/* Request Details */}
      <div className="p-6 space-y-4">
        {/* Who */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#031635] flex items-center justify-center text-3xl shadow-md">
            👤
          </div>
          <div>
            <p className="text-2xl font-black text-[#031635]">{req.consumerName}</p>
            {req.consumerDistanceMeters != null && (
              <p className="text-base font-semibold text-[#44474E]">
                {req.consumerDistanceMeters < 1000
                  ? `${Math.round(req.consumerDistanceMeters)} m away`
                  : `${(req.consumerDistanceMeters / 1000).toFixed(1)} km away`}
              </p>
            )}
          </div>
        </div>

        {/* What they want */}
        <div className="bg-white rounded-2xl border-2 border-amber-200 p-5 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🍳</span>
            <div>
              <p className="text-xl font-black text-[#031635]">{req.serviceName}</p>
              {req.preferredTime && (
                <p className="text-lg font-bold text-[#44474E]">{req.preferredTime}</p>
              )}
            </div>
          </div>
          {req.message && (
            <p className="text-lg text-[#031635] italic font-medium border-t border-amber-100 pt-3">
              &ldquo;{req.message}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-6 pb-6 space-y-3">
        <p className="text-lg font-bold text-[#44474E] text-center">
          Do you want to help {req.consumerName}?
        </p>

        {/* YES — Double Tap Button */}
        {rejectState === 'IDLE' && (
          <button
            id={`accept-btn-${req.id}`}
            onClick={handleAcceptTap}
            className={`w-full py-5 font-black text-xl rounded-3xl shadow-lg transition-all active:scale-[0.97] ${
              tapState === 'FIRST_TAP'
                ? 'bg-emerald-400 text-white border-4 border-emerald-600 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {tapState === 'FIRST_TAP' ? (
              <span>
                ✋ TAP ONCE MORE TO CONFIRM
              </span>
            ) : (
              <span>✅ YES, I CAN HELP</span>
            )}
          </button>
        )}

        {/* First-tap instruction */}
        {tapState === 'FIRST_TAP' && rejectState === 'IDLE' && (
          <p className="text-center text-base font-bold text-emerald-800 animate-pulse">
            You tapped once. Tap the green button again to confirm.
          </p>
        )}

        {/* I CAN'T THIS TIME — reject flow */}
        {rejectState === 'IDLE' && tapState !== 'FIRST_TAP' && (
          <button
            id={`reject-btn-${req.id}`}
            onClick={handleRejectFirst}
            className="w-full py-5 bg-white border-2 border-[#E3E2E0] hover:border-rose-300 hover:bg-rose-50 text-[#031635] font-black text-xl rounded-3xl transition active:scale-[0.97]"
          >
            ❌ I CAN&apos;T THIS TIME
          </button>
        )}

        {/* Reject confirmation */}
        {rejectState === 'CONFIRMING' && (
          <div className="bg-white border-2 border-rose-300 rounded-3xl p-5 space-y-4">
            <p className="text-xl font-bold text-[#031635] text-center">Are you sure?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleRejectConfirm}
                className="py-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-lg rounded-2xl shadow transition active:scale-95"
              >
                Yes, I can&apos;t help
              </button>
              <button
                onClick={() => setRejectState('IDLE')}
                className="py-4 bg-[#FAF9F6] border-2 border-[#E3E2E0] text-[#031635] font-black text-lg rounded-2xl transition active:scale-95"
              >
                Go Back
              </button>
            </div>
          </div>
        )}

        {/* Cancel first tap */}
        {tapState === 'FIRST_TAP' && rejectState === 'IDLE' && (
          <button
            onClick={() => setTapState('IDLE')}
            className="w-full py-3 text-base text-[#44474E] font-semibold hover:underline"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────
export default function ProviderRequestPanel({
  requests,
  onRespond,
  onClose,
}: ProviderRequestPanelProps) {
  const pendingRequests = requests.filter((r) => r.status === 'REQUESTED');
  const pastRequests = requests.filter(
    (r) => r.status === 'ACCEPTED' || r.status === 'REJECTED'
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <div
        className="bg-white border-2 border-[#031635] rounded-3xl shadow-2xl max-w-lg w-full flex flex-col max-h-[92vh]"
        style={{ fontFamily: "'Lexend', sans-serif" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-[#E3E2E0] px-7 py-5 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🔔</span>
            <div>
              <h2 className="text-2xl font-black text-[#031635]">Someone Needs Your Help</h2>
              {pendingRequests.length > 0 ? (
                <p className="text-base font-bold text-amber-700">
                  {pendingRequests.length} {pendingRequests.length === 1 ? 'person is' : 'people are'} waiting for your answer
                </p>
              ) : (
                <p className="text-base font-semibold text-[#44474E]">All caught up!</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 rounded-full hover:bg-slate-100 text-[#44474E] transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Empty state */}
          {pendingRequests.length === 0 && pastRequests.length === 0 && (
            <div className="py-16 text-center space-y-4">
              <div className="text-6xl">📭</div>
              <p className="text-2xl font-black text-[#031635]">No requests right now</p>
              <p className="text-lg text-[#44474E] font-medium">
                When someone nearby asks for your help, they will appear here.
              </p>
            </div>
          )}

          {/* Pending requests */}
          {pendingRequests.map((req) => (
            <RequestCard key={req.id} req={req} onRespond={onRespond} />
          ))}

          {/* Past requests */}
          {pastRequests.length > 0 && (
            <div className="pt-4 border-t-2 border-[#E3E2E0] space-y-3">
              <p className="text-base font-extrabold text-[#44474E] uppercase tracking-wide">Earlier</p>
              {pastRequests.map((req) => (
                <RequestCard key={req.id} req={req} onRespond={onRespond} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
