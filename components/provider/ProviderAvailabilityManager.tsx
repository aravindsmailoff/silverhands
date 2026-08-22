'use client';

import React, { useEffect, useState } from 'react';
import { Calendar, Plus, Trash2 } from 'lucide-react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Slot {
  id: string;
  label: string;
}

interface ProviderAvailabilityManagerProps {
  providerId: string;
}

export default function ProviderAvailabilityManager({ providerId }: ProviderAvailabilityManagerProps) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [message, setMessage] = useState<string | null>(null);

  const loadSlots = async () => {
    if (!providerId) return;
    const res = await fetch(`/api/providers/availability?providerId=${encodeURIComponent(providerId)}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.formatted)) {
      setSlots(data.formatted);
    }
  };

  useEffect(() => {
    loadSlots();
  }, [providerId]);

  const addSlot = async () => {
    setMessage(null);
    const res = await fetch('/api/providers/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, dayOfWeek, startTime, endTime }),
    });
    const data = await res.json();
    if (data.success) {
      setMessage('Availability saved. Consumers will see this slot when booking.');
      loadSlots();
    } else {
      setMessage(data.message || 'Could not save availability.');
    }
  };

  const removeSlot = async (id: string) => {
    await fetch(`/api/providers/availability?id=${id}&providerId=${encodeURIComponent(providerId)}`, {
      method: 'DELETE',
    });
    loadSlots();
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
      <h3 className="text-xl font-black text-white flex items-center gap-2">
        <Calendar className="w-6 h-6 text-[#FDBC13]" />
        Your Availability
      </h3>
      <p className="text-white/70 text-base">Set when consumers can book sessions with you.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(Number(e.target.value))}
          className="p-3 rounded-xl bg-white/10 text-white text-lg border border-white/20"
        >
          {DAYS.map((d, i) => (
            <option key={d} value={i} className="text-black">{d}</option>
          ))}
        </select>
        <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
          className="p-3 rounded-xl bg-white/10 text-white text-lg border border-white/20" />
        <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
          className="p-3 rounded-xl bg-white/10 text-white text-lg border border-white/20" />
      </div>

      <button onClick={addSlot}
        className="flex items-center gap-2 px-5 py-3 bg-[#FDBC13] text-[#031635] font-bold rounded-xl">
        <Plus className="w-5 h-5" /> Add Time Slot
      </button>

      {message && <p className="text-emerald-300 text-base">{message}</p>}

      <ul className="space-y-2">
        {slots.map((s) => (
          <li key={s.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl text-white text-lg">
            <span>{s.label}</span>
            <button onClick={() => removeSlot(s.id)} className="text-red-300 hover:text-red-200" aria-label="Remove slot">
              <Trash2 className="w-5 h-5" />
            </button>
          </li>
        ))}
        {slots.length === 0 && (
          <li className="text-white/50 text-base">No slots yet. Add your first availability above.</li>
        )}
      </ul>
    </div>
  );
}
