'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getActiveUserAccount, getSavedProfile } from '@/lib/voice-agent';
import { 
  Search, MapPin, ChefHat, Award, ArrowRight, 
  ShieldCheck, Languages, ArrowLeft, Loader2 
} from 'lucide-react';

interface ProviderAccount {
  id: string;
  user_name: string;
  skill: string | null;
  experience_years: number | null;
  location: string | null;
  language: string | null;
  face_photo_url: string | null;
  services?: any;
}

export default function ProvidersSearchPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderAccount[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeUser, setActiveUser] = useState<string | null>(null);

  useEffect(() => {
    const active = getActiveUserAccount();
    setActiveUser(active);

    fetch('/api/users/sync')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.accounts) {
          // Normalize and filter out any accounts that do not have names
          const normalized = data.accounts.map((acc: any) => ({
            id: acc.id,
            user_name: acc.user_name || 'Anonymous Provider',
            skill: acc.skill || 'Craftsman',
            experience_years: acc.experience_years !== null ? Number(acc.experience_years) : 0,
            location: acc.location || 'India',
            language: acc.language || 'English',
            face_photo_url: acc.face_photo_url || null,
          }));
          setProviders(normalized);
        }
      })
      .catch(err => console.error('[Fetch Providers Error]:', err))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredProviders = providers.filter(p => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.user_name.toLowerCase().includes(q) ||
      (p.skill || '').toLowerCase().includes(q) ||
      (p.location || '').toLowerCase().includes(q) ||
      (p.language || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col antialiased">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                🤝
              </div>
              <div>
                <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
                <span className="text-xs font-semibold text-[#44474E] tracking-widest uppercase block -mt-1">Service Directory</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1 bg-[#F4F3F1] p-1.5 rounded-full border border-[#E3E2E0]">
              <Link href="/dashboard" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Dashboard
              </Link>
              <Link href="/providers" className="px-5 py-2 rounded-full bg-[#031635] text-white font-bold text-sm shadow-sm">
                Search Providers
              </Link>
              <Link href="/profile" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                My Profile
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 px-4 py-2 bg-[#EFEEEB] hover:bg-[#E3E2E0] rounded-2xl text-sm font-bold text-[#031635] transition"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow max-w-screen-2xl w-full mx-auto px-6 lg:px-12 py-10 space-y-10">
        
        {/* Title & Description */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <h1 className="text-4xl md:text-5xl font-black text-[#031635] tracking-tight">
            Find Senior Service Providers
          </h1>
          <p className="text-lg text-[#44474E] font-medium">
            Connect with experienced senior creators, master craftsmen, and service professionals verified by SilverHands.
          </p>
        </div>

        {/* Search Bar Widget */}
        <div className="max-w-2xl mx-auto">
          <div className="relative flex items-center bg-white border-2 border-[#E3E2E0] rounded-2xl shadow-md focus-within:border-[#031635] transition-all overflow-hidden p-1">
            <div className="pl-4 text-[#75777F]">
              <Search className="w-6 h-6" />
            </div>
            <input
              type="text"
              placeholder="Search by name, skill (e.g. Cooking, Gardening), or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-0 outline-none px-4 py-4 text-[#1A1C1A] font-medium placeholder-[#75777F] text-base"
            />
          </div>
        </div>

        {/* Directory Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 className="w-12 h-12 text-[#031635] animate-spin" />
            <p className="text-sm font-bold text-[#44474E]">Loading service providers...</p>
          </div>
        ) : filteredProviders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProviders.map((provider) => (
              <div 
                key={provider.id} 
                className="bg-white border-2 border-[#E3E2E0] rounded-3xl p-6 shadow-md hover:shadow-xl hover:border-[#031635]/40 transition duration-300 flex flex-col justify-between"
              >
                <div className="space-y-6">
                  {/* Provider Header (Avatar + Name) */}
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-[#031635] bg-[#031635] text-white flex items-center justify-center text-4xl font-bold shadow-md shrink-0 relative">
                      {provider.face_photo_url ? (
                        <img src={provider.face_photo_url} alt={provider.user_name} className="w-full h-full object-cover" />
                      ) : (
                        <span>👴</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-lg text-[#031635] line-clamp-1">{provider.user_name}</span>
                        <ShieldCheck className="w-5 h-5 text-[#2D5A27] shrink-0" title="Guardian Verified" />
                      </div>
                      <div className="flex items-center gap-1 text-sm font-semibold text-[#44474E]">
                        <ChefHat className="w-4 h-4 text-[#031635]" />
                        <span className="truncate max-w-[150px]">{provider.skill || 'Craftsmanship'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Profile highlights */}
                  <div className="bg-[#FAF9F6] rounded-2xl p-4 border border-[#E3E2E0] space-y-2 text-sm font-semibold text-[#44474E]">
                    <div className="flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#FDBC13]" />
                      <span>{provider.experience_years} Years Experience</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#031635]" />
                      <span className="truncate">{provider.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Languages className="w-4 h-4 text-[#031635]" />
                      <span>Speaks: {provider.language}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    onClick={() => router.push(`/profile?username=${encodeURIComponent(provider.user_name)}`)}
                    className="w-full py-3.5 bg-[#031635] hover:bg-[#1C3150] text-[#FDBC13] font-bold rounded-2xl shadow-md transition flex items-center justify-center gap-2 text-sm"
                  >
                    View Profile <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="max-w-md mx-auto text-center py-20 space-y-4">
            <div className="w-20 h-20 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto text-3xl">
              🔍
            </div>
            <div className="text-xl font-extrabold text-[#031635]">No Providers Found</div>
            <p className="text-sm text-[#75777F] font-semibold">
              We couldn&apos;t find any service providers matching &quot;{searchQuery}&quot;. Try adjusting your search query.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#E3E2E0] py-8 text-center text-xs font-semibold text-[#75777F]">
        <div className="max-w-screen-2xl mx-auto px-6">
          © {new Date().getFullYear()} SilverHands. Connecting generations through wisdom and craftsmanship.
        </div>
      </footer>
    </div>
  );
}
