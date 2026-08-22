/**
 * Authoritative Local Authentication & Session Service for SilverHands
 * 
 * Powered exclusively by IndexedDB (`SilverHandsLocalDB`).
 * Provides:
 * - SHA-256 client-side hashing via Web Crypto API
 * - Local provider & consumer registration
 * - Password & PIN verification (Face ID completely decoupled from auth critical path)
 * - Session restoration across page reloads within the same browser origin
 */

import { localDB, DBUser, DBCreatorProfile, DBSession } from './local-db';

export async function hashPassword(plainPassword: string): Promise<string> {
  if (!plainPassword) return '';
  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(plainPassword.trim());
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('[AuthService] WebCrypto not available, using standard encoding hash:', e);
  }
  // Fallback deterministic non-crypto hash for environments where subtle is blocked
  let hash = 0;
  for (let i = 0; i < plainPassword.length; i++) {
    const char = plainPassword.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}

export interface RegisterProviderParams {
  username: string;
  skill?: string;
  experienceYears?: number | null;
  location?: string;
  locality?: string;
  city?: string;
  state?: string;
  language?: string;
  services?: string[];
  availability?: string | null;
  password?: string;
  voicePin?: string;
  photoUrl?: string | null;
}

export interface RegisterConsumerParams {
  username: string;
  email: string;
  password: string;
  location?: string;
}

class AuthService {
  private activeSession: DBSession | null = null;
  private isInitialized = false;

  public async initSession(): Promise<DBSession | null> {
    if (typeof window === 'undefined') return null;
    if (this.isInitialized && this.activeSession) return this.activeSession;

    try {
      // Auto-seed default demo providers in IndexedDB if not present
      const lakshmi = await localDB.get<DBUser>('users', 'usr_prov_lakshmi_ammal');
      if (!lakshmi) {
        await this.registerProvider({
          username: 'Lakshmi Ammal',
          skill: 'Traditional Cooking',
          experienceYears: 35,
          location: 'Mylapore, Chennai',
          city: 'Chennai',
          state: 'Tamil Nadu',
          language: 'Tamil & English',
          services: ['Home Cooking', 'Tamil Cooking Class', 'Traditional Tailoring'],
          availability: 'Weekdays 10 AM - 6 PM',
          password: 'silver123',
          voicePin: '1234'
        });
      }

      const sundaram = await localDB.get<DBUser>('users', 'usr_prov_sundaram_master');
      if (!sundaram) {
        await this.registerProvider({
          username: 'Sundaram Master',
          skill: 'Terracotta Pottery',
          experienceYears: 40,
          location: 'Mandaveli, Chennai',
          city: 'Chennai',
          state: 'Tamil Nadu',
          language: 'Tamil & English',
          services: ['Pottery Workshop', 'Clay Sculpting', 'Terracotta Crafting'],
          availability: 'Daily 9 AM - 5 PM',
          password: 'silver123',
          voicePin: '5678'
        });
      }

      const sessions = await localDB.getAll<DBSession>('sessions');
      const now = new Date().toISOString();
      const valid = sessions.filter(s => s.expiresAt > now).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (valid.length > 0) {
        this.activeSession = valid[0];
      } else {
        this.activeSession = null;
      }
    } catch (err) {
      console.warn('[AuthService] Error initializing session from IndexedDB:', err);
      this.activeSession = null;
    }

    this.isInitialized = true;
    return this.activeSession;
  }

  public getSession(): DBSession | null {
    return this.activeSession;
  }

  public async getActiveUser(): Promise<DBUser | null> {
    const session = await this.initSession();
    if (!session) return null;
    return localDB.get<DBUser>('users', session.userId);
  }

  public async getActiveProfile(): Promise<DBCreatorProfile | null> {
    const session = await this.initSession();
    if (!session) return null;
    const profiles = await localDB.getByIndex<DBCreatorProfile>('profiles', 'userId', session.userId);
    return profiles[0] || null;
  }

  // ── Provider Registration ────────────────────────────────────────────────

  public async registerProvider(params: RegisterProviderParams): Promise<{ user: DBUser; profile: DBCreatorProfile }> {
    const rawName = params.username.trim();
    if (!rawName) throw new Error('Username is required.');

    const userId = `usr_prov_${rawName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const passwordHash = params.password ? await hashPassword(params.password) : undefined;
    const now = new Date().toISOString();

    const user: DBUser = {
      id: userId,
      username: rawName,
      role: 'senior',
      passwordHash,
      voicePin: params.voicePin?.replace(/\D/g, '') || undefined,
      createdAt: now,
      updatedAt: now
    };

    await localDB.put<DBUser>('users', user);

    const profileId = `prof_${userId}`;
    const profile: DBCreatorProfile = {
      id: profileId,
      userId,
      displayName: rawName,
      skill: params.skill || 'Senior Artisan',
      experienceYears: params.experienceYears ?? 10,
      location: params.location || 'India',
      locality: params.locality,
      city: params.city,
      state: params.state,
      language: params.language || 'English',
      services: params.services || ['Traditional Crafts', 'Mentorship'],
      availability: params.availability || 'Weekdays 10 AM - 5 PM',
      photoUrl: params.photoUrl || null,
      createdAt: now,
      updatedAt: now
    };

    await localDB.put<DBCreatorProfile>('profiles', profile);

    // Create active session
    await this.createSession(user);

    return { user, profile };
  }

  // ── Consumer Registration ────────────────────────────────────────────────

  public async registerConsumer(params: RegisterConsumerParams): Promise<DBUser> {
    const email = params.email.trim().toLowerCase();
    const username = params.username.trim();
    if (!email || !params.password) throw new Error('Email and password are required.');

    // Check if email already registered in IndexedDB
    const existing = await localDB.getByIndex<DBUser>('users', 'email', email);
    if (existing.length > 0) {
      throw new Error('An account with this email address already exists.');
    }

    const userId = `usr_cons_${Date.now()}`;
    const passwordHash = await hashPassword(params.password);
    const now = new Date().toISOString();

    const user: DBUser = {
      id: userId,
      username: username || email.split('@')[0],
      email,
      role: 'consumer',
      passwordHash,
      createdAt: now,
      updatedAt: now
    };

    await localDB.put<DBUser>('users', user);
    await this.createSession(user);

    return user;
  }

  // ── Provider Login (Password, PIN, or Name) ──────────────────────────────

  public async loginProviderByPassword(usernameOrEmail: string, plainPassword: string): Promise<DBUser> {
    const q = usernameOrEmail.trim().toLowerCase();
    const hash = await hashPassword(plainPassword);
    const allUsers = await localDB.getAll<DBUser>('users');

    const matched = allUsers.find(u => 
      u.role === 'senior' &&
      (u.username.toLowerCase() === q || (u.email && u.email.toLowerCase() === q)) &&
      (!u.passwordHash || u.passwordHash === hash)
    );

    if (!matched) {
      throw new Error('Invalid provider credentials.');
    }

    await this.createSession(matched);
    return matched;
  }

  public async loginProviderByPin(voicePin: string): Promise<DBUser> {
    const cleanPin = voicePin.replace(/\D/g, '');
    if (cleanPin.length < 4) throw new Error('Please enter a valid 4-digit PIN.');

    const allUsers = await localDB.getAll<DBUser>('users');
    const matched = allUsers.find(u => u.role === 'senior' && u.voicePin && (u.voicePin === cleanPin || u.voicePin.includes(cleanPin)));

    if (!matched) {
      throw new Error('Voice PIN not recognized for any registered provider.');
    }

    await this.createSession(matched);
    return matched;
  }

  public async loginProviderByUsername(username: string): Promise<DBUser> {
    const q = username.trim().toLowerCase();
    const allUsers = await localDB.getAll<DBUser>('users');
    const matched = allUsers.find(u => u.role === 'senior' && u.username.toLowerCase() === q);

    if (!matched) {
      throw new Error(`Provider account "${username}" not found.`);
    }

    await this.createSession(matched);
    return matched;
  }

  // ── Consumer Login ───────────────────────────────────────────────────────

  public async loginConsumer(email: string, plainPassword: string): Promise<DBUser> {
    const cleanEmail = email.trim().toLowerCase();
    const hash = await hashPassword(plainPassword);
    const users = await localDB.getByIndex<DBUser>('users', 'email', cleanEmail);
    const user = users[0];

    if (!user || user.passwordHash !== hash) {
      throw new Error('Invalid email or password.');
    }

    await this.createSession(user);
    return user;
  }

  // ── Session Creation & Teardown ──────────────────────────────────────────

  private async createSession(user: DBUser): Promise<DBSession> {
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const token = `tok_${user.id}_${Date.now()}`;

    const session: DBSession = {
      id: `sess_${user.id}`,
      userId: user.id,
      username: user.username,
      role: user.role,
      token,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString()
    };

    await localDB.put<DBSession>('sessions', session);
    this.activeSession = session;
    return session;
  }

  public async logout(): Promise<void> {
    if (this.activeSession) {
      await localDB.delete('sessions', this.activeSession.id);
      this.activeSession = null;
    }
  }

  public async getAllProviders(): Promise<Array<{ user: DBUser; profile: DBCreatorProfile }>> {
    const users = await localDB.getAll<DBUser>('users');
    const providers = users.filter(u => u.role === 'senior');
    const results: Array<{ user: DBUser; profile: DBCreatorProfile }> = [];

    for (const p of providers) {
      const profs = await localDB.getByIndex<DBCreatorProfile>('profiles', 'userId', p.id);
      if (profs.length > 0) {
        results.push({ user: p, profile: profs[0] });
      } else {
        // Construct default profile if missing
        results.push({
          user: p,
          profile: {
            id: `prof_${p.id}`,
            userId: p.id,
            displayName: p.username,
            skill: 'Senior Artisan',
            experienceYears: 10,
            location: 'India',
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
          }
        });
      }
    }

    return results;
  }
}

export const authService = new AuthService();
