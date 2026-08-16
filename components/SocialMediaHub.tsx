'use client';

import React, { useState, useEffect } from 'react';
import { Video, Camera, Globe, Share2, CheckCircle2, ShieldCheck, Mail } from 'lucide-react';
import { voiceService } from '@/lib/voice';
import { getSavedProfile, saveProfileState } from '@/lib/voice-agent';

export interface SocialConfig {
  hasGoogleAccount: boolean;
  googleEmail: string | null;
  platforms: {
    youtube: boolean;
    instagram: boolean;
    facebook: boolean;
    tiktok: boolean;
  };
}

export const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
  hasGoogleAccount: true,
  googleEmail: 'senior.creator@gmail.com',
  platforms: {
    youtube: true,
    instagram: true,
    facebook: true,
    tiktok: false
  }
};

export default function SocialMediaHub() {
  const [socialConfig, setSocialConfig] = useState<SocialConfig>(DEFAULT_SOCIAL_CONFIG);
  const [userEmailInput, setUserEmailInput] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('silverhands_social_config');
      if (saved) {
        try {
          setSocialConfig(JSON.parse(saved));
        } catch (e) {
          console.warn('Error loading social config:', e);
        }
      }
    }
  }, []);

  const saveConfig = (updated: SocialConfig) => {
    setSocialConfig(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('silverhands_social_config', JSON.stringify(updated));
    }
  };

  const togglePlatform = (platform: keyof SocialConfig['platforms']) => {
    const updated = {
      ...socialConfig,
      platforms: {
        ...socialConfig.platforms,
        [platform]: !socialConfig.platforms[platform]
      }
    };
    saveConfig(updated);

    const newState = updated.platforms[platform] ? 'enabled' : 'disabled';
    voiceService.speak(`${platform} cross-posting is now ${newState}.`, 'en-IN');
  };

  const [suggestedGmail, setSuggestedGmail] = useState<string>('');
  const [showGoogleSignupCard, setShowGoogleSignupCard] = useState(false);

  const handleGoogleAccountAnswer = (hasGoogle: boolean) => {
    if (!hasGoogle) {
      const profile = getSavedProfile();
      const rawName = (profile.name || 'senior creator').toLowerCase().replace(/[^a-z0-9]/g, '');
      const generatedHandle = `${rawName}.silverhands@gmail.com`;
      setSuggestedGmail(generatedHandle);
      setShowGoogleSignupCard(true);

      const googleSignupUrl = `https://accounts.google.com/signup?hl=en`;
      
      voiceService.speak(
        `Launching official Google Gmail registration. Suggested email is ${generatedHandle}. Complete setup on Google's page, then enter your Gmail below to connect.`,
        'en-IN'
      );

      // Open Official Google Account Registration Page in new tab
      if (typeof window !== 'undefined') {
        window.open(googleSignupUrl, '_blank', 'noopener,noreferrer');
      }
    } else {
      setShowGoogleSignupCard(false);
      voiceService.speak("Great! Please enter your existing Gmail address to connect.", 'en-IN');
    }
  };

  const handleConnectGmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userEmailInput.trim()) {
      const emailToConnect = userEmailInput.trim();
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailToConnect })
        });
        const data = await res.json();
        
        const updated = {
          ...socialConfig,
          hasGoogleAccount: true,
          googleEmail: emailToConnect
        };
        saveConfig(updated);
        setUserEmailInput('');
        setShowGoogleSignupCard(false);
        voiceService.speak(`Connected your official Google account ${emailToConnect} to YouTube & social cross-posting.`, 'en-IN');
      } catch (err) {
        console.warn('Google connect notice:', err);
      }
    }
  };

  return (
    <div className="bg-white border-2 border-[#031635] rounded-3xl p-6 md:p-8 shadow-xl space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E3E2E0] pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#031635] text-[#FDBC13] rounded-2xl flex items-center justify-center font-bold text-xl shadow-md">
            <Share2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#031635]">Social Media Cross-Posting Hub</h2>
            <p className="text-sm text-[#44474E]">Automated publishing across Instagram, YouTube, Facebook & TikTok</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold">
          <ShieldCheck className="w-4 h-4 text-emerald-600" /> Guardian Cross-Posting Enabled
        </div>
      </div>

      {/* Section 1: Google Account Provisioning */}
      <div className="bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mail className="w-6 h-6 text-[#031635]" />
            <div>
              <h3 className="text-lg font-extrabold text-[#031635]">Google / Gmail Account Identity</h3>
              <p className="text-xs text-[#44474E]">Required for YouTube channel setup and cross-posting authentication.</p>
            </div>
          </div>

          {socialConfig.googleEmail && (
            <span className="bg-emerald-100 text-emerald-800 text-xs font-extrabold px-3 py-1.5 rounded-full flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Connected
            </span>
          )}
        </div>

        {socialConfig.googleEmail ? (
          <div className="p-4 bg-white border border-[#E3E2E0] rounded-xl flex items-center justify-between">
            <div>
              <div className="text-xs text-[#75777F] uppercase font-bold tracking-wider">Active Creator Email</div>
              <div className="text-base font-extrabold text-[#031635]">{socialConfig.googleEmail}</div>
            </div>
            <button
              onClick={() => handleGoogleAccountAnswer(false)}
              className="text-xs font-bold text-[#031635] hover:underline"
            >
              Generate New Email
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm font-bold text-[#031635]">Do you currently have a Google / Gmail account?</p>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleGoogleAccountAnswer(false)}
                className="flex-1 py-3 bg-[#031635] text-[#FDBC13] font-bold text-sm rounded-xl hover:bg-[#1a2b4b] transition flex items-center justify-center gap-2 shadow-md"
              >
                ❌ No, Open Google Gmail Registration
              </button>
              <button
                onClick={() => handleGoogleAccountAnswer(true)}
                className="flex-1 py-3 bg-[#EFEEEB] text-[#031635] font-bold text-sm rounded-xl border border-[#E3E2E0] hover:bg-[#E3E2E0] transition flex items-center justify-center gap-2"
              >
                ✓ Yes, I Have a Gmail Account
              </button>
            </div>

            {showGoogleSignupCard && (
              <div className="p-5 bg-amber-50 border-2 border-[#FDBC13] rounded-2xl space-y-4 shadow-sm animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-[#031635] text-sm">
                    🌐 Official Google Accounts Registration Portal
                  </div>
                  <span className="text-xs font-bold text-[#6B4D00] bg-[#FFDEA3] px-2.5 py-1 rounded-full">
                    GOOGLE GMAIL
                  </span>
                </div>

                <p className="text-xs text-[#44474E] leading-relaxed">
                  SilverHands has pre-formatted your suggested Gmail address: <span className="font-extrabold text-[#031635]">{suggestedGmail}</span>. Click below to complete registration on Google's official page:
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href="https://accounts.google.com/signup?hl=en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-md transition inline-flex items-center justify-center gap-2"
                  >
                    🚀 Launch accounts.google.com (Official Gmail Setup)
                  </a>
                </div>

                <form onSubmit={handleConnectGmail} className="space-y-2 pt-2 border-t border-[#FDBC13]/40">
                  <label className="text-xs font-extrabold text-[#031635] block">
                    Once created on Google, enter your new Gmail address here to connect:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder={suggestedGmail || 'yourname@gmail.com'}
                      value={userEmailInput}
                      onChange={(e) => setUserEmailInput(e.target.value)}
                      className="flex-1 px-4 py-2.5 bg-white border-2 border-[#E3E2E0] rounded-xl text-sm font-semibold outline-none focus:border-[#031635]"
                      required
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 bg-[#031635] text-[#FDBC13] font-extrabold text-xs rounded-xl hover:bg-[#1a2b4b] transition shadow-md shrink-0"
                    >
                      Connect Gmail
                    </button>
                  </div>
                </form>
              </div>
            )}

            {!showGoogleSignupCard && (
              <form onSubmit={handleConnectGmail} className="flex gap-2 pt-2">
                <input
                  type="email"
                  placeholder="Enter your existing Gmail address..."
                  value={userEmailInput}
                  onChange={(e) => setUserEmailInput(e.target.value)}
                  className="flex-1 px-4 py-2.5 border-2 border-[#E3E2E0] rounded-xl text-sm font-semibold outline-none focus:border-[#031635]"
                  required
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#FDBC13] text-[#261900] font-extrabold text-xs rounded-xl hover:bg-[#F3B20B] transition shadow-md shrink-0"
                >
                  Connect Account
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Section 2: Social Media Platform Toggles */}
      <div className="space-y-4">
        <h3 className="text-lg font-extrabold text-[#031635]">Enable / Disable Social Media Channels</h3>
        <p className="text-sm text-[#44474E]">
          When you record a video in Video Studio, it will automatically post to all channels turned <span className="font-extrabold text-emerald-700">ON</span> below:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* YouTube Toggle */}
          <div className="p-5 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <div className="font-extrabold text-[#031635]">YouTube Reels & Shorts</div>
                <div className="text-xs text-[#75777F]">Auto-post short tutorials</div>
              </div>
            </div>

            <button
              onClick={() => togglePlatform('youtube')}
              className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors duration-300 ${
                socialConfig.platforms.youtube ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
              }`}
            >
              <span className="w-6 h-6 bg-white rounded-full shadow-md transform transition-transform" />
            </button>
          </div>

          {/* Instagram Toggle */}
          <div className="p-5 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md">
                <Camera className="w-6 h-6" />
              </div>
              <div>
                <div className="font-extrabold text-[#031635]">Instagram Reels</div>
                <div className="text-xs text-[#75777F]">Original Instagram connection</div>
              </div>
            </div>

            <button
              onClick={() => togglePlatform('instagram')}
              className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors duration-300 ${
                socialConfig.platforms.instagram ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
              }`}
            >
              <span className="w-6 h-6 bg-white rounded-full shadow-md transform transition-transform" />
            </button>
          </div>

          {/* Facebook Toggle */}
          <div className="p-5 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold shadow-md">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <div className="font-extrabold text-[#031635]">Facebook Watch & Videos</div>
                <div className="text-xs text-[#75777F]">Post to Creator Page</div>
              </div>
            </div>

            <button
              onClick={() => togglePlatform('facebook')}
              className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors duration-300 ${
                socialConfig.platforms.facebook ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
              }`}
            >
              <span className="w-6 h-6 bg-white rounded-full shadow-md transform transition-transform" />
            </button>
          </div>

          {/* TikTok Toggle */}
          <div className="p-5 bg-[#FAF9F6] border-2 border-[#E3E2E0] rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center font-bold shadow-md">
                <Share2 className="w-6 h-6" />
              </div>
              <div>
                <div className="font-extrabold text-[#031635]">TikTok Creator Feed</div>
                <div className="text-xs text-[#75777F]">Post to TikTok profile</div>
              </div>
            </div>

            <button
              onClick={() => togglePlatform('tiktok')}
              className={`w-14 h-8 flex items-center rounded-full p-1 transition-colors duration-300 ${
                socialConfig.platforms.tiktok ? 'bg-emerald-600 justify-end' : 'bg-slate-300 justify-start'
              }`}
            >
              <span className="w-6 h-6 bg-white rounded-full shadow-md transform transition-transform" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
