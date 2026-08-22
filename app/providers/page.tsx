'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService } from '@/lib/auth-service';
import { 
  Search, MapPin, ChefHat, Award, ArrowRight, 
  ShieldCheck, Languages, ArrowLeft, Loader2, 
  ShoppingBag, Clock, Plus, CheckCircle2, MessageSquare, 
  IndianRupee, Send, Sparkles, Filter, X 
} from 'lucide-react';

interface ConsumerDemandOrder {
  id: string;
  consumerName: string;
  consumerLocation: string;
  distanceLabel: string;
  category: 'cooking' | 'pottery' | 'tailoring' | 'music' | 'gardening' | 'lessons';
  title: string;
  description: string;
  budget: string;
  preferredTime: string;
  status: 'OPEN' | 'CLAIMED' | 'FULFILLED';
  createdAt: string;
}

const INITIAL_DEMANDS: ConsumerDemandOrder[] = [
  {
    id: 'DEM-101',
    consumerName: 'Arun Kumar',
    consumerLocation: 'Mylapore, Chennai',
    distanceLabel: '650m away',
    category: 'cooking',
    title: 'Authentic Chettinad Home Cooking for Family Gathering (6 People)',
    description: 'Looking for an experienced elder cook to prepare authentic Chettinad chicken curry, pepper rasam, and vegetable poriyal for 6 family members tonight.',
    budget: '₹1,500',
    preferredTime: 'Today by 6:30 PM',
    status: 'OPEN',
    createdAt: '10 mins ago'
  },
  {
    id: 'DEM-102',
    consumerName: 'Priya Sundaram',
    consumerLocation: 'Mandaveli, Chennai',
    distanceLabel: '1.1 km away',
    category: 'tailoring',
    title: 'Silk Saree Fall Stitching & Blouse Fitting Alteration',
    description: 'Need urgent fall stitching and custom sleeve alteration for a traditional Kanchipuram silk saree before a wedding this weekend.',
    budget: '₹650',
    preferredTime: 'Tomorrow Morning',
    status: 'OPEN',
    createdAt: '25 mins ago'
  },
  {
    id: 'DEM-103',
    consumerName: 'Deepak Rao',
    consumerLocation: 'Adyar, Chennai',
    distanceLabel: '2.3 km away',
    category: 'pottery',
    title: 'Handmade 5-Liter Terracotta Water Pot with Brass Tap',
    description: 'Seeking a master potter to craft or provide an authentic unglazed clay pot for natural summer water cooling.',
    budget: '₹950',
    preferredTime: 'Within 2 Days',
    status: 'OPEN',
    createdAt: '1 hour ago'
  },
  {
    id: 'DEM-104',
    consumerName: 'Meera Swaminathan',
    consumerLocation: 'Online / Live Video',
    distanceLabel: 'Online Lesson',
    category: 'music',
    title: 'Beginner Carnatic Vocal Lesson (1-on-1 for Child)',
    description: 'Seeking an elder music teacher to teach basic Sarali Varisai and classical bhajans to an 8-year-old child via interactive 1-on-1 video.',
    budget: '₹500 / hr',
    preferredTime: 'Saturday 10:00 AM',
    status: 'OPEN',
    createdAt: '2 hours ago'
  },
  {
    id: 'DEM-105',
    consumerName: 'Karthik Raja',
    consumerLocation: 'Alwarpet, Chennai',
    distanceLabel: '1.8 km away',
    category: 'gardening',
    title: 'Organic Vegetable & Herbal Terrace Garden Setup Advice',
    description: 'Need consultation from an experienced elder gardener on potting mix, organic pest control for curry leaf and holy basil (tulsi).',
    budget: '₹800',
    preferredTime: 'Sunday 4:00 PM',
    status: 'OPEN',
    createdAt: '3 hours ago'
  }
];

export default function ConsumerDemandsAndOrdersPage() {
  const router = useRouter();
  const [demands, setDemands] = useState<ConsumerDemandOrder[]>(INITIAL_DEMANDS);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [claimedOrderIds, setClaimedOrderIds] = useState<Set<string>>(new Set());
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<'cooking' | 'pottery' | 'tailoring' | 'music' | 'gardening' | 'lessons'>('cooking');
  const [newBudget, setNewBudget] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLocation, setNewLocation] = useState('');

  const handleClaimOrder = (orderId: string) => {
    setClaimedOrderIds((prev) => {
      const next = new Set(prev);
      next.add(orderId);
      return next;
    });
    setDemands((prev) =>
      prev.map((d) => (d.id === orderId ? { ...d, status: 'CLAIMED' } : d))
    );
  };

  const handlePostDemand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const createdDemand: ConsumerDemandOrder = {
      id: `DEM-${Date.now().toString().slice(-4)}`,
      consumerName: 'You (Consumer)',
      consumerLocation: newLocation || 'Chennai, India',
      distanceLabel: 'Nearby',
      category: newCategory,
      title: newTitle,
      description: newDescription || 'Looking for traditional craftsmanship and service.',
      budget: newBudget || '₹800',
      preferredTime: newTime || 'As soon as possible',
      status: 'OPEN',
      createdAt: 'Just now'
    };

    setDemands([createdDemand, ...demands]);
    setIsPostModalOpen(false);
    setNewTitle('');
    setNewBudget('');
    setNewDescription('');
    setNewTime('');
    setNewLocation('');
  };

  const filteredDemands = demands.filter((d) => {
    const matchesCategory = selectedCategory === 'all' || d.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      d.title.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.consumerLocation.toLowerCase().includes(q) ||
      d.consumerName.toLowerCase().includes(q);
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="bg-[#FAF9F6] text-[#1A1C1A] font-['Lexend',sans-serif] min-h-screen flex flex-col antialiased">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-[#E3E2E0] shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 lg:px-12 h-20 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-11 h-11 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-black shadow-md group-hover:scale-105 transition-transform">
                🤝
              </div>
              <div>
                <span className="font-extrabold text-2xl text-[#031635] tracking-tight block">SilverHands</span>
                <span className="text-xs font-semibold text-[#44474E] tracking-widest uppercase block -mt-1">Orders & Demands Board</span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1 bg-[#F4F3F1] p-1.5 rounded-full border border-[#E3E2E0]">
              <Link href="/consumer/dashboard" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                Marketplace
              </Link>
              <Link href="/providers" className="px-5 py-2 rounded-full bg-[#031635] text-[#FDBC13] font-bold text-sm shadow-sm">
                📋 Consumer Demands & Orders
              </Link>
              <Link href="/nearby" className="px-5 py-2 rounded-full text-[#44474E] hover:text-[#031635] font-semibold text-sm transition">
                📍 Live Radar
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPostModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-extrabold shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Post a Demand
            </button>
            <Link
              href="/consumer/dashboard"
              className="flex items-center gap-2 px-4 py-2 bg-[#EFEEEB] hover:bg-[#E3E2E0] rounded-2xl text-xs font-bold text-[#031635] transition border border-[#E3E2E0]"
            >
              <ArrowLeft className="w-4 h-4" /> Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow max-w-screen-2xl w-full mx-auto px-6 lg:px-12 py-10 space-y-8">
        {/* Title Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-full text-xs font-extrabold uppercase tracking-wider">
            <ShoppingBag className="w-3.5 h-3.5" /> Live Marketplace Orders & Requests
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-[#031635] tracking-tight">
            What Consumers Are Demanding
          </h1>
          <p className="text-base text-[#44474E] font-medium">
            Verified requests and orders from nearby buyers looking for home cooking, pottery, custom tailoring, and masterclasses.
          </p>
        </div>

        {/* Search & Category Filter Controls */}
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="relative flex items-center bg-white border-2 border-[#E3E2E0] rounded-2xl shadow-sm focus-within:border-[#031635] transition-all p-1">
            <div className="pl-4 text-[#75777F]">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              placeholder="Search consumer demands by cuisine, craft, alteration, or locality..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-0 outline-none px-4 py-3 text-[#1A1C1A] font-semibold placeholder-[#75777F] text-sm"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-extrabold scrollbar-none">
            {[
              { label: 'All Demands', value: 'all', emoji: '📋' },
              { label: 'Cooking & Catering', value: 'cooking', emoji: '🍳' },
              { label: 'Tailoring & Stitching', value: 'tailoring', emoji: '🧵' },
              { label: 'Pottery & Sculpting', value: 'pottery', emoji: '🏺' },
              { label: 'Music & Lessons', value: 'music', emoji: '🎵' },
              { label: 'Gardening & Plants', value: 'gardening', emoji: '🌿' },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setSelectedCategory(cat.value)}
                  className={`px-4 py-2 rounded-xl transition border whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#031635] text-[#FDBC13] border-[#031635] shadow-sm'
                      : 'bg-white text-[#44474E] border-[#E3E2E0] hover:bg-[#F4F3F1]'
                  }`}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Demands Grid */}
        {filteredDemands.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {filteredDemands.map((demand) => {
              const isClaimed = claimedOrderIds.has(demand.id) || demand.status === 'CLAIMED';

              return (
                <div
                  key={demand.id}
                  className={`bg-white border-2 rounded-3xl p-6 shadow-md transition duration-300 flex flex-col justify-between ${
                    isClaimed
                      ? 'border-emerald-400 bg-emerald-50/30'
                      : 'border-[#E3E2E0] hover:border-[#031635]/40 hover:shadow-xl'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header with Consumer info and status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#031635] to-[#0a2f68] text-[#FDBC13] flex items-center justify-center text-xl font-black shadow">
                          👤
                        </div>
                        <div>
                          <span className="font-extrabold text-sm text-[#031635] block leading-tight">
                            {demand.consumerName}
                          </span>
                          <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-emerald-600" /> {demand.consumerLocation} • {demand.distanceLabel}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          isClaimed
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {isClaimed ? '✓ Claimed' : '🟢 Open Order'}
                      </span>
                    </div>

                    {/* Order Title & Description */}
                    <div>
                      <h3 className="font-extrabold text-base text-[#031635] leading-snug mb-2">
                        {demand.title}
                      </h3>
                      <p className="text-xs text-[#44474E] font-medium leading-relaxed bg-[#FAF9F6] p-3.5 rounded-2xl border border-[#E3E2E0]">
                        &ldquo;{demand.description}&rdquo;
                      </p>
                    </div>

                    {/* Meta Info: Budget & Preferred Time */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-bold text-[#031635]">
                      <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="block text-[10px] uppercase text-emerald-700 font-extrabold">Offered Budget</span>
                        <span className="text-base font-black text-emerald-900">{demand.budget}</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        <span className="block text-[10px] uppercase text-slate-500 font-extrabold">Required Time</span>
                        <span className="text-xs font-black text-slate-800 truncate block mt-1">{demand.preferredTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-6 flex items-center gap-2">
                    {isClaimed ? (
                      <div className="w-full py-3 bg-emerald-700 text-white font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 shadow-sm">
                        <CheckCircle2 className="w-4 h-4" /> You Claimed This Order!
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => handleClaimOrder(demand.id)}
                          className="flex-1 py-3 bg-[#031635] hover:bg-[#08295e] text-[#FDBC13] font-extrabold text-xs rounded-2xl shadow-md transition flex items-center justify-center gap-1.5"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Accept & Fulfill
                        </button>
                        <Link
                          href={`/profile?username=${encodeURIComponent(demand.consumerName)}`}
                          className="p-3 bg-[#FAF9F6] hover:bg-[#E3E2E0] text-[#031635] rounded-2xl border border-[#E3E2E0] transition"
                          title="Contact Consumer"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="max-w-md mx-auto text-center py-20 space-y-4">
            <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto text-2xl">
              🔍
            </div>
            <div className="text-lg font-extrabold text-[#031635]">No Matching Demands Found</div>
            <p className="text-xs text-[#75777F] font-semibold">
              There are currently no consumer orders matching &quot;{searchQuery}&quot;. Try adjusting your filters.
            </p>
          </div>
        )}
      </main>

      {/* Post a Demand Modal */}
      {isPostModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#031635] rounded-3xl p-6 shadow-2xl max-w-lg w-full space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-[#E3E2E0] pb-3">
              <h3 className="font-extrabold text-lg text-[#031635] flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" /> Post a Service Demand
              </h3>
              <button onClick={() => setIsPostModalOpen(false)} className="p-1 text-[#44474E] hover:text-black">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePostDemand} className="space-y-3 text-xs font-bold text-[#031635]">
              <div>
                <label className="block text-[10px] text-[#75777F] uppercase mb-1">What service / craft do you need?</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Traditional Home Cooking for 5 people, Terracotta Pot Repair..."
                  className="w-full p-2.5 bg-[#FAF9F6] border border-[#E3E2E0] rounded-xl text-xs font-semibold text-[#031635]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#75777F] uppercase mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e: any) => setNewCategory(e.target.value)}
                    className="w-full p-2.5 bg-[#FAF9F6] border border-[#E3E2E0] rounded-xl text-xs font-semibold text-[#031635]"
                  >
                    <option value="cooking">Cooking & Food</option>
                    <option value="tailoring">Tailoring & Stitching</option>
                    <option value="pottery">Pottery & Clay Art</option>
                    <option value="music">Music Lessons</option>
                    <option value="gardening">Gardening</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-[#75777F] uppercase mb-1">Budget (₹)</label>
                  <input
                    type="text"
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                    placeholder="e.g. ₹1,200"
                    className="w-full p-2.5 bg-[#FAF9F6] border border-[#E3E2E0] rounded-xl text-xs font-semibold text-[#031635]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-[#75777F] uppercase mb-1">Preferred Time / Date</label>
                  <input
                    type="text"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="e.g. Today by 7 PM"
                    className="w-full p-2.5 bg-[#FAF9F6] border border-[#E3E2E0] rounded-xl text-xs font-semibold text-[#031635]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#75777F] uppercase mb-1">Your Locality</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="e.g. Mylapore, Chennai"
                    className="w-full p-2.5 bg-[#FAF9F6] border border-[#E3E2E0] rounded-xl text-xs font-semibold text-[#031635]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#75777F] uppercase mb-1">Detailed Requirements</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe dietary preferences, specific materials, dimensions, or learning goals..."
                  className="w-full p-2.5 bg-[#FAF9F6] border border-[#E3E2E0] rounded-xl text-xs font-medium text-[#031635]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition"
              >
                Publish Service Demand to Marketplace
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
