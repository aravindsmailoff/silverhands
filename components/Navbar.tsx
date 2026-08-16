'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AuthModal } from './AuthModal';
import { ShieldCheck, Mic, Compass, UserCheck, LogOut, User } from 'lucide-react';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { currentUser, activeRole, switchRole, logout } = useAuth();
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#090d16]/90 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-3.5 shadow-2xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Clean Brand */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl shadow-lg group-hover:scale-105 transition-transform border border-indigo-400/30">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold text-white tracking-tight">SilverHands</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full">
                  SIH MVP
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium">Voice Elder Marketplace & Guardian Safety</p>
            </div>
          </Link>

          {/* Quick Role Switcher Bar (For SIH Judges & Demo) */}
          <div className="hidden lg:flex items-center p-1 bg-slate-900/90 border border-slate-800 rounded-xl gap-1">
            <span className="px-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold">Active Role:</span>
            <button
              onClick={() => switchRole('senior')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeRole === 'senior'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              👴 Senior Creator
            </button>
            <button
              onClick={() => switchRole('buyer')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeRole === 'buyer'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🛒 Buyer
            </button>
            <button
              onClick={() => switchRole('guardian')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeRole === 'guardian'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🛡️ Guardian
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition border ${
                pathname === '/'
                  ? 'bg-slate-800 text-indigo-400 border-indigo-500/30'
                  : 'text-slate-300 border-transparent hover:bg-slate-800/60'
              }`}
            >
              <Compass className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Browse</span>
            </Link>

            <Link
              href="/create"
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                pathname === '/create'
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-lg'
                  : 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30'
              }`}
            >
              <Mic className="w-4 h-4 text-rose-400 animate-pulse" />
              <span>Voice Speak</span>
            </Link>

            <Link
              href="/guardian/dashboard"
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                pathname.startsWith('/guardian')
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Guardian Hub</span>
            </Link>

            {currentUser ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
                <div className="hidden xl:block text-right">
                  <div className="text-xs font-bold text-white">{currentUser.name}</div>
                  <div className="text-[10px] font-semibold text-indigo-400 capitalize">{currentUser.role}</div>
                </div>
                <button
                  onClick={logout}
                  title="Logout"
                  className="p-2 text-slate-400 hover:text-rose-400 bg-slate-900 border border-slate-800 rounded-xl transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 btn-primary-gradient text-xs font-bold rounded-xl shadow transition"
              >
                <User className="w-4 h-4" />
                Login
              </button>
            )}
          </nav>
        </div>
      </header>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </>
  );
};
