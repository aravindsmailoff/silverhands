'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ShieldCheck, Phone, KeyRound, Sparkles, X } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { sendMockOtp, verifyMockOtp } = useAuth();
  const [phone, setPhone] = useState('+91 98765 43210');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'senior' | 'buyer' | 'guardian'>('senior');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [mockOtpHint, setMockOtpHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await sendMockOtp(phone);
    setLoading(false);
    if (res.success) {
      setMockOtpHint(res.mockOtp);
      setStep('otp');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const success = await verifyMockOtp(phone, otp, role, name);
    setLoading(false);
    if (success) {
      onClose();
    } else {
      alert('Invalid OTP. Please enter 424242');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md p-6 glass-panel rounded-2xl border border-indigo-500/30 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">SilverHands Login</h2>
            <p className="text-xs text-slate-400">Voice-First Elder Marketplace with Guardian Safety</p>
          </div>
        </div>

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Your Full Name</label>
              <input
                type="text"
                placeholder="e.g. Savitri Devi"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Mobile Phone Number</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Select Account Type</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('senior')}
                  className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                    role === 'senior'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  👴 Elder / Creator
                </button>
                <button
                  type="button"
                  onClick={() => setRole('buyer')}
                  className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                    role === 'buyer'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  🛒 Local Buyer
                </button>
                <button
                  type="button"
                  onClick={() => setRole('guardian')}
                  className={`p-2.5 rounded-xl border text-xs font-medium transition ${
                    role === 'guardian'
                      ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  🛡️ Guardian
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-medium rounded-xl shadow-lg glow-indigo transition text-sm flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? 'Sending OTP...' : 'Send Mock OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
                <KeyRound className="w-4 h-4" />
                Mock SMS Gateway (SIH Demo Mode)
              </div>
              <p className="text-xs text-slate-300">
                Mock OTP for {phone} is: <span className="font-mono text-amber-300 font-bold">{mockOtpHint}</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Enter 6-Digit OTP</label>
              <input
                type="text"
                placeholder="424242"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-center font-mono text-lg tracking-widest"
                required
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl font-medium"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-semibold rounded-xl shadow-lg glow-emerald"
              >
                {loading ? 'Verifying...' : 'Verify & Login'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
