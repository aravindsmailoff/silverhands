'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Sparkles, Mic, Video, ShoppingBag, ShieldCheck, 
  UserCheck, ArrowRight, Heart, Star, Award, BookOpen, CheckCircle2, Users, Handshake 
} from 'lucide-react';

export default function NewLandingPage() {
  return (
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col antialiased">
      {/* Sticky Desktop Navigation Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black text-2xl shadow-md group-hover:scale-105 transition-transform">
              🤝
            </div>
            <div>
              <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
              <span className="text-xs font-bold text-[#FDBC13] tracking-widest uppercase block -mt-1 bg-[#031635] px-2 py-0.5 rounded-full text-center">
                Senior Livelihood Platform
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-extrabold text-[#44474E]">
            <a href="#about" className="hover:text-[#031635] transition">About Platform</a>
            <a href="#roles" className="hover:text-[#031635] transition">Portals</a>
            <a href="#how-it-works" className="hover:text-[#031635] transition">How It Works</a>
            <a href="#impact" className="hover:text-[#031635] transition">Impact</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/provider"
              className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] text-xs font-extrabold rounded-2xl border border-[#E3E2E0] transition"
            >
              👴🏽 Service Provider Portal
            </Link>

            <Link
              href="/consumer/login"
              className="flex items-center gap-2 px-5 py-2.5 bg-[#FDBC13] hover:bg-[#e0a50b] text-[#031635] text-xs font-extrabold rounded-2xl shadow-md transition"
            >
              🛒 Consumer Portal <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-16 lg:pt-20 lg:pb-24 bg-gradient-to-b from-white to-[#FAF9F6] border-b border-[#E3E2E0]">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 text-center relative z-10">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#031635] text-[#FDBC13] font-black text-xs uppercase tracking-widest mb-6 shadow-sm border border-[#FDBC13]/30">
            <Sparkles className="w-4 h-4 text-[#FDBC13]" /> India's First Voice-Powered Senior Livelihood Ecosystem
          </span>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-[#031635] tracking-tight max-w-4xl mx-auto leading-none mb-6">
            Monetize Lifelong Skills & Connect Senior Masters with Next-Gen Learners
          </h1>

          <p className="text-base md:text-xl text-[#44474E] max-w-3xl mx-auto font-medium leading-relaxed mb-10">
            Empowering Indian senior citizens to earn with dignity. Service providers offer 1-on-1 live masterclasses & authentic handmade creations while consumers buy directly and learn timeless wisdom.
          </p>

          {/* DUAL ROLE SELECTION CARDS SECTION */}
          <div id="roles" className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
            {/* ROLE 1: SERVICE PROVIDER */}
            <div className="bg-white rounded-3xl p-8 border-2 border-[#031635] shadow-xl hover:shadow-2xl transition flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#031635]/5 rounded-bl-full pointer-events-none" />
              <div>
                <div className="w-14 h-14 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center text-3xl font-black mb-6 shadow-md">
                  👴🏽
                </div>

                <span className="text-xs font-black text-[#FDBC13] uppercase tracking-widest bg-[#031635] px-3 py-1 rounded-full inline-block mb-3">
                  Option 1: Service Provider
                </span>

                <h2 className="text-2xl font-black text-[#031635] tracking-tight mb-3">
                  Service Provider Portal
                </h2>

                <p className="text-sm font-semibold text-[#44474E] leading-relaxed mb-6">
                  Create your profile effortlessly using <strong>Voice Speech AI</strong> (no typing required). Register Face ID security, host 1-on-1 live classes, sell handmade crafts/recipes, and get direct payouts.
                </p>
              </div>

              <Link
                href="/provider"
                className="w-full py-4 bg-[#031635] hover:bg-[#062454] text-white font-extrabold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 group-hover:scale-[1.02]"
              >
                Enter Service Provider Portal <ArrowRight className="w-4 h-4 text-[#FDBC13]" />
              </Link>
            </div>

            {/* ROLE 2: SERVICE CONSUMER (LEARNER & BUYER) */}
            <div className="bg-white rounded-3xl p-8 border-2 border-[#FDBC13] shadow-xl hover:shadow-2xl transition flex flex-col justify-between group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FDBC13]/10 rounded-bl-full pointer-events-none" />
              <div>
                <div className="w-14 h-14 bg-[#FDBC13] text-[#031635] rounded-2xl flex items-center justify-center text-3xl font-black mb-6 shadow-md">
                  🛒
                </div>

                <span className="text-xs font-black text-[#031635] uppercase tracking-widest bg-[#FDBC13] px-3 py-1 rounded-full inline-block mb-3">
                  Option 2: Service Consumer
                </span>

                <h2 className="text-2xl font-black text-[#031635] tracking-tight mb-3">
                  Consumer Portal
                </h2>

                <p className="text-sm font-semibold text-[#44474E] leading-relaxed mb-6">
                  Log in or register to buy authentic handmade terracotta pottery, Tanjore paintings, and homemade pickles. Book <strong>1-on-1 live appointments</strong> and use our <strong>Ollama AI Matchmaker</strong>.
                </p>
              </div>

              <Link
                href="/consumer/login"
                className="w-full py-4 bg-[#FDBC13] hover:bg-[#e0a50b] text-[#031635] font-extrabold text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 group-hover:scale-[1.02]"
              >
                Enter Consumer Portal <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT SCREEN SECTION */}
      <section id="about" className="py-20 bg-white border-b border-[#E3E2E0]">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="px-4 py-1.5 rounded-full bg-[#F4F3F1] text-[#031635] font-black text-xs uppercase tracking-widest border border-[#E3E2E0] inline-block mb-4">
              About SilverHands
            </span>
            <h2 className="text-3xl md:text-5xl font-black text-[#031635] tracking-tight">
              Transforming Senior Wisdom into Active Livelihood
            </h2>
            <p className="mt-4 text-base md:text-lg text-[#44474E] font-medium leading-relaxed">
              India is home to over 140 million senior citizens. Many possess unparalleled expertise in traditional crafts, culinary heritage, fine arts, and gardening—yet lack accessible digital tools. SilverHands bridges this gap.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[#FAF9F6] p-8 rounded-3xl border border-[#E3E2E0] space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#031635] text-[#FDBC13] flex items-center justify-center text-xl font-bold">
                <Mic className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-[#031635]">Voice AI Accessibility</h3>
              <p className="text-sm font-semibold text-[#44474E] leading-relaxed">
                Service providers create their profile, specify skills, and describe products simply by speaking in their native Indian language. Zero typing required.
              </p>
            </div>

            <div className="bg-[#FAF9F6] p-8 rounded-3xl border border-[#E3E2E0] space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#031635] text-[#FDBC13] flex items-center justify-center text-xl font-bold">
                <Video className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-[#031635]">1-on-1 Live Masterclasses</h3>
              <p className="text-sm font-semibold text-[#44474E] leading-relaxed">
                Consumers can book direct 1-on-1 live video appointments with master potters, Tanjore painters, and heritage chefs for personalized guidance.
              </p>
            </div>

            <div className="bg-[#FAF9F6] p-8 rounded-3xl border border-[#E3E2E0] space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#031635] text-[#FDBC13] flex items-center justify-center text-xl font-bold">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-[#031635]">Ollama AI Need Matchmaker</h3>
              <p className="text-sm font-semibold text-[#44474E] leading-relaxed">
                Consumers type any prompt (e.g., "biryani recipe video", "pottery"), and our local Ollama AI segregates matching videos, 1-on-1 sessions, and products instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-20 bg-[#FAF9F6] border-b border-[#E3E2E0]">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-[#031635] tracking-tight">
              How SilverHands Works
            </h2>
            <p className="mt-4 text-base text-[#44474E] font-semibold">
              Designed for extreme simplicity for service providers, and seamless discovery for consumers.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* For Service Providers */}
            <div className="bg-white p-8 lg:p-10 rounded-3xl border border-[#E3E2E0] shadow-md space-y-6">
              <div className="flex items-center gap-3 border-b border-[#E3E2E0] pb-4">
                <span className="text-3xl">👴🏽</span>
                <div>
                  <h3 className="text-xl font-black text-[#031635]">For Service Providers</h3>
                  <span className="text-xs font-bold text-[#44474E]">3 Simple Steps</span>
                </div>
              </div>

              <div className="space-y-4 text-sm font-semibold text-[#44474E]">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#031635] text-white flex items-center justify-center font-black text-xs shrink-0">1</span>
                  <p><strong className="text-[#031635]">Speak to Create Profile:</strong> Answer simple questions spoken by our AI voice assistant.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#031635] text-white flex items-center justify-center font-black text-xs shrink-0">2</span>
                  <p><strong className="text-[#031635]">Face ID & Voice PIN:</strong> Log in securely using camera facial scan or spoken PIN.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#031635] text-white flex items-center justify-center font-black text-xs shrink-0">3</span>
                  <p><strong className="text-[#031635]">Teach & Sell:</strong> List handmade pottery or offer 1-on-1 live appointments with direct bank payouts.</p>
                </div>
              </div>

              <Link href="/provider" className="inline-flex items-center gap-2 font-black text-sm text-[#031635] hover:underline pt-2">
                Open Service Provider Portal →
              </Link>
            </div>

            {/* For Consumers */}
            <div className="bg-white p-8 lg:p-10 rounded-3xl border border-[#E3E2E0] shadow-md space-y-6">
              <div className="flex items-center gap-3 border-b border-[#E3E2E0] pb-4">
                <span className="text-3xl">🛒</span>
                <div>
                  <h3 className="text-xl font-black text-[#031635]">For Learners & Buyers</h3>
                  <span className="text-xs font-bold text-[#44474E]">3 Simple Steps</span>
                </div>
              </div>

              <div className="space-y-4 text-sm font-semibold text-[#44474E]">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#FDBC13] text-[#031635] flex items-center justify-center font-black text-xs shrink-0">1</span>
                  <p><strong className="text-[#031635]">Create Consumer Account:</strong> Quick register with email, location, and topic interests.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#FDBC13] text-[#031635] flex items-center justify-center font-black text-xs shrink-0">2</span>
                  <p><strong className="text-[#031635]">AI Need Matchmaker:</strong> Chat with our local Ollama AI to segregate pottery, biryani videos, or Tanjore art.</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#FDBC13] text-[#031635] flex items-center justify-center font-black text-xs shrink-0">3</span>
                  <p><strong className="text-[#031635]">Buy & Learn 1-on-1:</strong> Purchase authentic crafts or book interactive live video appointments.</p>
                </div>
              </div>

              <Link href="/consumer/login" className="inline-flex items-center gap-2 font-black text-sm text-[#031635] hover:underline pt-2">
                Open Consumer Flow →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* PLATFORM IMPACT STATISTICS */}
      <section id="impact" className="py-16 bg-[#031635] text-white">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <span className="text-4xl md:text-5xl font-black text-[#FDBC13] block">10,000+</span>
            <span className="text-xs md:text-sm font-extrabold text-slate-300 uppercase tracking-wider block mt-1">Service Providers</span>
          </div>
          <div>
            <span className="text-4xl md:text-5xl font-black text-[#FDBC13] block">50,000+</span>
            <span className="text-xs md:text-sm font-extrabold text-slate-300 uppercase tracking-wider block mt-1">1-on-1 Live Appointments</span>
          </div>
          <div>
            <span className="text-4xl md:text-5xl font-black text-[#FDBC13] block">100%</span>
            <span className="text-xs md:text-sm font-extrabold text-slate-300 uppercase tracking-wider block mt-1">Direct Bank Payouts</span>
          </div>
          <div>
            <span className="text-4xl md:text-5xl font-black text-[#FDBC13] block">4.95 ★</span>
            <span className="text-xs md:text-sm font-extrabold text-slate-300 uppercase tracking-wider block mt-1">Average Rating</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-[#E3E2E0] py-12">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#031635] text-[#FDBC13] rounded-xl flex items-center justify-center font-black">
              🤝
            </div>
            <span className="font-extrabold text-lg text-[#031635]">SilverHands</span>
          </div>

          <div className="flex flex-wrap gap-6 text-xs font-bold text-[#44474E]">
            <Link href="/provider" className="hover:text-[#031635]">Service Provider Portal</Link>
            <Link href="/consumer/login" className="hover:text-[#031635]">Consumer Login</Link>
            <Link href="/consumer/register" className="hover:text-[#031635]">Consumer Registration</Link>
            <Link href="/consumer/dashboard" className="hover:text-[#031635]">Consumer Dashboard</Link>
          </div>

          <span className="text-xs font-semibold text-[#44474E]">
            © {new Date().getFullYear()} SilverHands Platform. All rights reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
