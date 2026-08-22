'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { saveConsumerUser } from '@/lib/consumer-store';
import { authService } from '@/lib/auth-service';
import { Lock, Mail, ArrowRight, ShoppingBag, ShieldCheck } from 'lucide-react';

export default function ConsumerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Try local IndexedDB authentication first
      try {
        const localUser = await authService.loginConsumer(email, password);
        saveConsumerUser({
          id: localUser.id,
          username: localUser.username,
          email: localUser.email || email,
        });
        router.push('/consumer/dashboard');
        return;
      } catch (localErr) {
        // Continue to server fallback
      }

      // 2. Server API fallback if already in database
      const res = await fetch('/api/consumer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });

      const data = await res.json();
      if (data.success && data.user) {
        saveConsumerUser(data.user);
        router.push('/consumer/dashboard');
      } else {
        setError(data.error || 'Invalid email or password.');
      }
    } catch (err: any) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] flex flex-col justify-center py-12 px-6 lg:px-8 antialiased">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex items-center justify-center gap-3 group mb-6">
          <div className="w-12 h-12 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg group-hover:scale-105 transition-transform">
            🤝
          </div>
          <div>
            <span className="font-extrabold text-3xl text-[#031635] tracking-tight block">SilverHands</span>
            <span className="text-xs font-bold text-[#FDBC13] uppercase tracking-widest block -mt-1 bg-[#031635] px-2 py-0.5 rounded-full text-center">
              Consumer Portal
            </span>
          </div>
        </Link>
        <h2 className="text-center text-3xl font-black text-[#031635] tracking-tight">
          Welcome Back, Learner
        </h2>
        <p className="mt-2 text-center text-sm text-[#44474E]">
          Log in to browse handmade senior products & book 1-on-1 live masterclasses.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-[#E3E2E0] sm:px-10">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm font-semibold rounded-2xl border border-red-200">
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-bold text-[#031635] mb-1.5">
                Email Address
              </label>
              <div className="relative rounded-2xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#44474E]">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="block w-full pl-11 pr-4 py-3 bg-[#F4F3F1] border border-[#E3E2E0] rounded-2xl text-sm font-semibold text-[#031635] focus:outline-none focus:ring-2 focus:ring-[#031635] focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#031635] mb-1.5">
                Password
              </label>
              <div className="relative rounded-2xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#44474E]">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full pl-11 pr-4 py-3 bg-[#F4F3F1] border border-[#E3E2E0] rounded-2xl text-sm font-semibold text-[#031635] focus:outline-none focus:ring-2 focus:ring-[#031635] focus:bg-white transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-2xl shadow-md text-sm font-bold text-white bg-[#031635] hover:bg-[#062454] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#031635] transition"
            >
              {isLoading ? 'Signing In...' : (
                <>
                  Sign In to Consumer Portal <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center border-t border-[#E3E2E0] pt-5">
            <p className="text-sm font-medium text-[#44474E]">
              Don't have a consumer account?{' '}
              <Link href="/consumer/register" className="font-bold text-[#031635] hover:underline">
                Create one now
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/" className="text-xs font-semibold text-[#44474E] hover:text-[#031635] transition">
            ← Switch to Senior Creator (Service Provider) Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
