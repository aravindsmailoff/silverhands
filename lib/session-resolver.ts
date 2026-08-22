/**
 * Authoritative Active Session & Role Resolver for SilverHands
 * 
 * Provides unified, deterministic resolution of the current user's:
 * - userId
 * - displayName
 * - role ('senior' | 'consumer')
 * - skill / services
 * 
 * Accurately prevents session collision between Consumer and Senior Provider portals.
 */

import { getActiveUserAccount, getSavedProfile } from './voice-agent';

export interface ActiveSessionInfo {
  userId: string;
  displayName: string;
  role: 'senior' | 'consumer';
  skill: string;
  services: string[];
}

export function resolveActiveSession(): ActiveSessionInfo {
  if (typeof window === 'undefined') {
    return {
      userId: 'usr_guest',
      displayName: 'Guest',
      role: 'consumer',
      skill: 'Learner',
      services: [],
    };
  }

  // Check URL search parameters (e.g. /nearby?role=consumer or /nearby?role=senior)
  let urlRole: string | null = null;
  if (window.location.search) {
    const params = new URLSearchParams(window.location.search);
    urlRole = params.get('role');
  }

  const pathname = window.location.pathname;
  const isConsumerRoute = pathname.startsWith('/consumer');
  const isSeniorRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/video/create');

  // Explicit role flag if set in localStorage
  const explicitRole = localStorage.getItem('silverhands_active_role');

  // Check Consumer profile
  let consumerUser: any = null;
  try {
    const raw = localStorage.getItem('silverhands_consumer_user');
    if (raw) consumerUser = JSON.parse(raw);
  } catch (e) {}

  // Check Senior Provider profile
  const activeSeniorName = getActiveUserAccount();
  const savedSeniorProfile = getSavedProfile();

  // ── 1. CONSUMER MODE PRIORITY ──
  // If URL explicitly requests consumer, or on /consumer route, or explicit role is consumer
  if (urlRole === 'consumer' || (isConsumerRoute && urlRole !== 'senior') || (explicitRole === 'consumer' && urlRole !== 'senior' && !isSeniorRoute)) {
    const cName = consumerUser?.username || consumerUser?.name || 'Arun';
    const cId = consumerUser?.id || `usr_consumer_${cName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    return {
      userId: cId,
      displayName: cName,
      role: 'consumer',
      skill: 'Learner',
      services: [],
    };
  }

  // ── 2. SENIOR PROVIDER MODE PRIORITY ──
  // If URL explicitly requests senior, or on /dashboard route, or explicit role is senior / active senior logged in
  if (urlRole === 'senior' || isSeniorRoute || explicitRole === 'senior' || activeSeniorName) {
    const sName = activeSeniorName || savedSeniorProfile.name || 'Lakshmi Ammal';
    const sId = `usr_prov_${sName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const svcs =
      savedSeniorProfile.services && savedSeniorProfile.services.length > 0
        ? savedSeniorProfile.services
        : [savedSeniorProfile.skill || 'Traditional Cooking'];

    return {
      userId: sId,
      displayName: sName,
      role: 'senior',
      skill: savedSeniorProfile.skill || 'Senior Artisan',
      services: svcs,
    };
  }

  // ── 3. Default Consumer Mode ──
  const cName = consumerUser?.username || consumerUser?.name || 'Arun';
  const cId = consumerUser?.id || `usr_consumer_${cName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  return {
    userId: cId,
    displayName: cName,
    role: 'consumer',
    skill: 'Learner',
    services: [],
  };
}
