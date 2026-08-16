'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSavedProfile } from '@/lib/voice-agent';
import { voiceService } from '@/lib/voice';
import {
  ArrowLeft, Plus, Trash2, ToggleLeft, ToggleRight,
  Package, Share2, Edit2, Mic, MicOff, CheckCircle2, RefreshCw, ArrowRight
} from 'lucide-react';

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  is_active: boolean;
  created_at: string;
  creator_name: string;
}

const STEPS = [
  {
    key: 'title',
    label: 'Product Name',
    question: 'What is the name of your product?',
    hint: 'e.g. "Homemade Mango Pickle" or "Handmade Sweater"',
    extract: (text: string) => text.trim().slice(0, 120),
  },
  {
    key: 'description',
    label: 'Description',
    question: 'Tell me about your product. What is special about it?',
    hint: 'e.g. "Made with fresh mangoes and authentic home spices."',
    extract: (text: string) => text.trim(),
  },
  {
    key: 'price',
    label: 'Price in Rupees',
    question: 'What is the price in rupees?',
    hint: 'e.g. "150" or "two hundred rupees"',
    extract: (text: string) => {
      const digits = text.match(/\d[\d,]*/);
      if (digits) return String(parseInt(digits[0].replace(/,/g, '')));
      const lower = text.toLowerCase();
      const map: Record<string, number> = {
        zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
        eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,
        twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,
        hundred:100,thousand:1000,lakh:100000,
      };
      let total = 0, current = 0;
      lower.split(/\s+/).forEach(w => {
        const v = map[w];
        if (!v) return;
        if (v === 100) current *= 100;
        else if (v === 1000 || v === 100000) { total += (current || 1) * v; current = 0; }
        else current += v;
      });
      total += current;
      return total > 0 ? String(total) : '';
    },
  },
  {
    key: 'stock',
    label: 'Available Quantity',
    question: 'How many items do you have ready to sell?',
    hint: 'e.g. "5" or "10 items"',
    extract: (text: string) => {
      const m = text.match(/\d+/);
      if (m) return m[0];
      const words: Record<string, string> = { one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',twenty:'20',fifty:'50' };
      const lower = text.toLowerCase();
      for (const [w, n] of Object.entries(words)) if (lower.includes(w)) return n;
      return '1';
    },
  },
  {
    key: 'category',
    label: 'Category',
    question: 'What category is it? Cooking, Handicrafts, Tailoring, Gardening, or General.',
    hint: 'Say Cooking, Handicrafts, Tailoring, Gardening or General',
    extract: (text: string) => {
      const lower = text.toLowerCase();
      if (lower.includes('cook') || lower.includes('food') || lower.includes('recipe') || lower.includes('snack') || lower.includes('pickle')) return 'cooking';
      if (lower.includes('handicraft') || lower.includes('craft') || lower.includes('handmade') || lower.includes('knit') || lower.includes('stitch')) return 'handicrafts';
      if (lower.includes('tailor') || lower.includes('sew') || lower.includes('cloth') || lower.includes('dress') || lower.includes('blouse')) return 'tailoring';
      if (lower.includes('garden') || lower.includes('plant') || lower.includes('flower') || lower.includes('seed') || lower.includes('sapling')) return 'gardening';
      return 'general';
    },
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  cooking: '🍛 Cooking & Food',
  handicrafts: '🧶 Handicrafts',
  tailoring: '🧵 Tailoring',
  gardening: '🌿 Gardening',
  general: '📦 General',
};

type ConvState = 'idle' | 'listening' | 'processing' | 'done';

export default function ProductsPage() {
  const router = useRouter();
  const [profile, setProfile]   = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);

  // Conversation UI state
  const [showConv, setShowConv]     = useState(false);
  const [convStep, setConvStep]     = useState(0);
  const [convState, setConvState]   = useState<ConvState>('idle');
  const [convData, setConvData]     = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState('');
  const [saving, setSaving]         = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Refs to guarantee NO stale closures
  const convStepRef   = useRef(0);
  const convDataRef   = useRef<Record<string, string>>({});
  const transcriptRef = useRef('');
  const recogRef      = useRef<any>(null);

  useEffect(() => {
    const saved = getSavedProfile();
    if (!saved?.name) { router.push('/'); return; }
    setProfile(saved);
    fetchProducts(saved.name);
  }, [router]);

  const fetchProducts = async (name: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/products?creatorName=${encodeURIComponent(name)}`);
      const data = await res.json();
      setProducts(data.success ? data.products : []);
    } catch { setProducts([]); }
    finally   { setLoading(false); }
  };

  // TTS Speak function
  const speak = useCallback((text: string, onDone?: () => void) => {
    if (typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-IN';
    utt.rate = 0.9;
    utt.pitch = 1.0;
    utt.onend = () => { onDone?.(); };
    utt.onerror = () => { onDone?.(); };
    window.speechSynthesis.speak(utt);
  }, []);

  // Process an answer for the CURRENT step ref
  const processAnswer = useCallback((raw: string) => {
    const currentIdx = convStepRef.current;
    const step = STEPS[currentIdx];
    if (!step) return;

    const extractedVal = step.extract(raw) || raw;
    const updatedData = { ...convDataRef.current, [step.key]: extractedVal };
    convDataRef.current = updatedData;
    setConvData(updatedData);

    const nextIdx = currentIdx + 1;
    if (nextIdx < STEPS.length) {
      convStepRef.current = nextIdx;
      setConvStep(nextIdx);
      setConvState('idle');
      transcriptRef.current = '';
      setTranscript('');

      // Speak next question
      setTimeout(() => {
        speak(STEPS[nextIdx].question, () => {
          setTimeout(() => {
            startListeningForStep();
          }, 500);
        });
      }, 500);
    } else {
      convStepRef.current = STEPS.length;
      setConvState('done');
      speak('Great! I have all your product details. Please review them and tap Save Product.');
    }
  }, [speak]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start Speech Recognition
  const startListeningForStep = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition not supported on this browser. You can type your answer below.');
      return;
    }

    if (recogRef.current) {
      try { recogRef.current.abort(); } catch (_) {}
    }

    const r = new SR();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-IN';

    transcriptRef.current = '';
    setTranscript('');

    r.onresult = (e: any) => {
      let interim = '', final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      const text = (final || interim).trim();
      if (text) {
        transcriptRef.current = text;
        setTranscript(text);
      }
    };

    r.onend = () => {
      setConvState('processing');
      const spoken = transcriptRef.current.trim();
      if (spoken) {
        processAnswer(spoken);
      } else {
        setConvState('idle');
        speak("I didn't hear anything. Please tap the mic button and try speaking again.");
      }
    };

    r.onerror = (err: any) => {
      console.warn('SpeechRec error:', err);
      setConvState('idle');
    };

    try {
      r.start();
      recogRef.current = r;
      setConvState('listening');
    } catch (e) {
      setConvState('idle');
    }
  }, [speak, processAnswer]);

  // Start Conversation modal
  const startConversation = (editing?: Product) => {
    setEditingProduct(editing || null);
    const initialData: Record<string, string> = editing
      ? { title: editing.title, description: editing.description, price: String(editing.price), stock: String(editing.stock), category: editing.category }
      : { title: '', description: '', price: '', stock: '', category: '' };

    convStepRef.current = 0;
    convDataRef.current = initialData;
    transcriptRef.current = '';

    setConvStep(0);
    setConvData(initialData);
    setTranscript('');
    setConvState('idle');
    setShowConv(true);

    setTimeout(() => {
      const intro = editing
        ? `Let's update your product "${editing.title}". ${STEPS[0].question}`
        : `Hello! I will help you list your product. ${STEPS[0].question}`;

      speak(intro, () => {
        setTimeout(() => {
          startListeningForStep();
        }, 500);
      });
    }, 400);
  };

  const stopListening = () => {
    if (recogRef.current) {
      try { recogRef.current.abort(); } catch (_) {}
    }
    setConvState('idle');
  };

  const closeConversation = () => {
    stopListening();
    if (typeof window !== 'undefined') window.speechSynthesis.cancel();
    setShowConv(false);
  };

  // Confirm and Save to Database
  const confirmSave = async () => {
    setSaving(true);
    const data = convDataRef.current;
    try {
      await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingProduct?.id,
          title: data.title || 'Handmade Product',
          description: data.description || '',
          price: parseFloat(data.price) || 100,
          category: data.category || 'general',
          stock: parseInt(data.stock) || 1,
          creator_name: profile.name,
        }),
      });
      speak('Your product has been saved successfully!', () => {
        setShowConv(false);
        fetchProducts(profile.name);
      });
    } catch {
      alert('Failed to save product. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
    fetchProducts(profile.name);
  };

  const toggleActive = async (p: Product) => {
    await fetch('/api/products', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, is_active: !p.is_active }),
    });
    fetchProducts(profile.name);
  };

  const shareProduct = (p: Product) => {
    const msg = `Hello! I am selling "${p.title}" for ₹${p.price}.\n${p.description || ''}\n\nContact me on SilverHands to buy!`;
    if (navigator.share) navigator.share({ title: p.title, text: msg });
    else { navigator.clipboard.writeText(msg); alert('Copied to clipboard! Paste it in WhatsApp to share.'); }
  };

  const currentStep = STEPS[convStep] || STEPS[0];
  const progress    = Math.round((Math.min(convStep, STEPS.length) / STEPS.length) * 100);

  return (
    <div className="bg-[#FFFDF7] min-h-screen flex flex-col" style={{ fontFamily: "'Lexend', sans-serif" }}>

      {/* Header */}
      <header className="bg-white border-b-4 border-[#FDBC13] shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-14 h-14 bg-[#031635] rounded-2xl flex items-center justify-center text-2xl shadow-md">🛍️</div>
            <div>
              <span className="font-black text-2xl text-[#031635] block">My Products</span>
              <span className="text-sm font-semibold text-[#44474E] block">Sell your homemade items</span>
            </div>
          </Link>
          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-5 py-3 bg-[#EFEEEB] hover:bg-[#E3E2E0] rounded-2xl text-base font-bold text-[#031635] transition">
            <ArrowLeft className="w-5 h-5" /> Back
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-10 space-y-8">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-[#031635]">Your Products</h1>
            <p className="text-lg text-[#44474E] font-medium mt-1">
              {products.length === 0 ? 'No products yet' : `${products.length} product${products.length > 1 ? 's' : ''} listed`}
            </p>
          </div>
          <button onClick={() => startConversation()}
            className="flex items-center gap-3 px-7 py-4 bg-[#031635] hover:bg-[#1a2b4b] text-[#FDBC13] text-xl font-black rounded-2xl shadow-lg active:scale-95 transition">
            <Plus className="w-7 h-7" /> Add Product
          </button>
        </div>

        {loading && (
          <div className="text-center py-20 text-2xl text-[#44474E] font-bold animate-pulse">Loading…</div>
        )}

        {/* Empty state */}
        {!loading && products.length === 0 && (
          <div className="text-center py-20 space-y-6">
            <div className="text-8xl">📦</div>
            <h2 className="text-3xl font-black text-[#031635]">No Products Yet</h2>
            <p className="text-xl text-[#44474E] font-medium max-w-md mx-auto">
              Tap Add Product — the AI will ask you simple questions and fill everything for you!
            </p>
            <button onClick={() => startConversation()}
              className="px-10 py-5 bg-[#031635] text-[#FDBC13] text-xl font-black rounded-2xl shadow-lg hover:bg-[#1a2b4b] transition active:scale-95">
              🎙️ Add Your First Product
            </button>
          </div>
        )}

        {/* Product cards */}
        {!loading && products.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {products.map(p => (
              <div key={p.id}
                className={`bg-white rounded-3xl border-2 shadow-md overflow-hidden ${p.is_active ? 'border-[#E3E2E0]' : 'border-rose-200 opacity-70'}`}>
                <div className="p-6 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-sm font-bold text-[#44474E]">{CATEGORY_LABELS[p.category] || p.category}</span>
                      <h3 className="text-2xl font-black text-[#031635] leading-tight mt-0.5">{p.title}</h3>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-black shrink-0 ${p.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
                      {p.is_active ? '✓ LIVE' : 'HIDDEN'}
                    </div>
                  </div>
                  {p.description && <p className="text-base text-[#44474E] font-medium leading-relaxed">{p.description}</p>}
                  <div className="flex items-center justify-between pt-1">
                    <div className="text-3xl font-black text-[#031635]">₹{p.price}</div>
                    <div className="text-sm font-bold text-[#44474E]">Stock: {p.stock}</div>
                  </div>
                </div>
                <div className="border-t-2 border-[#F4F3F1] grid grid-cols-4 divide-x-2 divide-[#F4F3F1]">
                  <button onClick={() => startConversation(p)}
                    className="flex flex-col items-center py-4 gap-1 hover:bg-blue-50 transition text-[#031635]">
                    <Edit2 className="w-5 h-5" /><span className="text-xs font-bold">Edit</span>
                  </button>
                  <button onClick={() => toggleActive(p)}
                    className={`flex flex-col items-center py-4 gap-1 transition ${p.is_active ? 'hover:bg-rose-50 text-rose-600' : 'hover:bg-emerald-50 text-emerald-700'}`}>
                    {p.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                    <span className="text-xs font-bold">{p.is_active ? 'Hide' : 'Show'}</span>
                  </button>
                  <button onClick={() => shareProduct(p)}
                    className="flex flex-col items-center py-4 gap-1 hover:bg-emerald-50 transition text-emerald-700">
                    <Share2 className="w-5 h-5" /><span className="text-xs font-bold">Share</span>
                  </button>
                  <button onClick={() => handleDelete(p.id, p.title)}
                    className="flex flex-col items-center py-4 gap-1 hover:bg-rose-50 transition text-rose-600">
                    <Trash2 className="w-5 h-5" /><span className="text-xs font-bold">Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── AI Voice Conversation Modal ── */}
      {showConv && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">

            {/* Modal Top */}
            <div className="bg-[#031635] px-8 py-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[#FDBC13] font-black text-xl">🤖 AI Assistant</span>
                <button onClick={closeConversation}
                  className="text-white/60 hover:text-white text-2xl font-bold transition leading-none">✕</button>
              </div>
              <div className="bg-white/20 rounded-full h-2 w-full">
                <div className="bg-[#FDBC13] h-2 rounded-full transition-all duration-500"
                  style={{ width: convState === 'done' ? '100%' : `${progress}%` }} />
              </div>
              <p className="text-white/60 text-xs font-semibold mt-2">
                {convState === 'done' ? 'All done! Review below.' : `Step ${convStep + 1} of ${STEPS.length}: ${currentStep.label}`}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">

              {convState !== 'done' ? (
                /* ── Question & Listening State ── */
                <div className="space-y-6">
                  {/* Question Bubble */}
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 bg-[#031635] rounded-full flex items-center justify-center text-xl shrink-0">🤖</div>
                    <div className="bg-[#F4F3F1] rounded-3xl rounded-tl-sm px-5 py-4 flex-1">
                      <p className="text-lg font-bold text-[#031635] leading-snug">{currentStep.question}</p>
                      <p className="text-sm text-[#75777F] mt-1">{currentStep.hint}</p>
                    </div>
                  </div>

                  {/* Spoken Answer Preview */}
                  {transcript && (
                    <div className="flex gap-3 items-start justify-end">
                      <div className="bg-[#031635] rounded-3xl rounded-tr-sm px-5 py-4 max-w-xs">
                        <p className="text-base font-semibold text-white">{transcript}</p>
                      </div>
                      <div className="w-10 h-10 bg-[#FDBC13] rounded-full flex items-center justify-center text-xl shrink-0">👤</div>
                    </div>
                  )}

                  {/* Mic Controls */}
                  <div className="flex flex-col items-center gap-4 pt-2">
                    {convState === 'listening' ? (
                      <button onClick={stopListening}
                        className="w-24 h-24 bg-rose-600 hover:bg-rose-700 rounded-full flex flex-col items-center justify-center gap-2 shadow-2xl animate-pulse transition active:scale-95">
                        <MicOff className="w-10 h-10 text-white" />
                        <span className="text-white text-xs font-black">STOP</span>
                      </button>
                    ) : convState === 'processing' ? (
                      <div className="w-24 h-24 bg-amber-400 rounded-full flex flex-col items-center justify-center gap-2 shadow-xl">
                        <RefreshCw className="w-10 h-10 text-white animate-spin" />
                        <span className="text-white text-xs font-black">THINKING</span>
                      </div>
                    ) : (
                      <button onClick={startListeningForStep}
                        className="w-24 h-24 bg-[#031635] hover:bg-[#1a2b4b] rounded-full flex flex-col items-center justify-center gap-2 shadow-2xl transition active:scale-95">
                        <Mic className="w-10 h-10 text-[#FDBC13]" />
                        <span className="text-[#FDBC13] text-xs font-black">SPEAK</span>
                      </button>
                    )}
                    <p className="text-base font-semibold text-[#44474E] text-center">
                      {convState === 'listening' ? '🔴 Listening… speak now' : convState === 'processing' ? 'Processing your answer…' : 'Tap mic to speak your answer'}
                    </p>
                  </div>

                  {/* Manual Type / Manual Next */}
                  <div className="border-t-2 border-[#F4F3F1] pt-4 space-y-3">
                    <div className="flex gap-2">
                      <input
                        value={transcript}
                        onChange={e => {
                          setTranscript(e.target.value);
                          transcriptRef.current = e.target.value;
                        }}
                        placeholder="Or type/edit your answer here…"
                        className="flex-1 px-4 py-3 border-2 border-[#E3E2E0] rounded-xl text-base font-semibold focus:border-[#031635] outline-none"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && transcript.trim()) {
                            stopListening();
                            processAnswer(transcript.trim());
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (transcript.trim()) {
                            stopListening();
                            processAnswer(transcript.trim());
                          }
                        }}
                        className="px-5 py-3 bg-[#031635] text-[#FDBC13] font-black rounded-xl transition hover:bg-[#1a2b4b] flex items-center gap-1">
                        Next <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Summary & Confirm ── */
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 shrink-0" />
                    <h3 className="text-2xl font-black text-[#031635]">Product Details Ready</h3>
                  </div>

                  <div className="bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl p-5 space-y-3">
                    <Row label="Product Name" value={convData.title} />
                    <Row label="Description" value={convData.description} />
                    <Row label="Price" value={`₹${convData.price}`} />
                    <Row label="Stock" value={`${convData.stock} items`} />
                    <Row label="Category" value={CATEGORY_LABELS[convData.category] || convData.category} />
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => {
                      convStepRef.current = 0;
                      setConvStep(0);
                      setConvState('idle');
                      setTranscript('');
                      setTimeout(() => {
                        speak(STEPS[0].question, () => {
                          setTimeout(startListeningForStep, 500);
                        });
                      }, 300);
                    }}
                      className="flex-1 py-4 bg-[#EFEEEB] hover:bg-[#E3E2E0] text-[#031635] font-bold text-lg rounded-2xl transition">
                      ↩ Start Over
                    </button>
                    <button onClick={confirmSave} disabled={saving}
                      className="flex-1 py-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-black text-lg rounded-2xl shadow-lg flex items-center justify-center gap-2 transition active:scale-95">
                      {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : '✓'} {saving ? 'Saving…' : 'Save Product'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-sm font-extrabold text-[#44474E] w-28 shrink-0">{label}</span>
      <span className="text-base font-bold text-[#031635] flex-1">{value || '—'}</span>
    </div>
  );
}
