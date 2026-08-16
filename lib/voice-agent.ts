import { voiceService } from './voice';

export interface ProfileState {
  name: string | null;
  skill: string | null;
  experience_years: number | null;
  location: string | null;
  language: string | null;
  services: string[];
  availability: string | null;
}

export interface ConversationTurn {
  role: 'assistant' | 'user';
  text: string;
}

export interface AgentTurnResponse {
  extracted_data: Partial<ProfileState>;
  next_question: string;
  updated_profile: ProfileState;
  completed: boolean;
  confirmation_mode: boolean;
}

export const INITIAL_PROFILE_STATE: ProfileState = {
  name: null,
  skill: 'Traditional Cooking & Crafts',
  experience_years: 30,
  location: 'Mylapore, Chennai',
  language: 'Tamil & English',
  services: ['Online Lessons', 'Handmade Products'],
  availability: 'Available Daily'
};

const STORAGE_KEY = 'silverhands_user_profile';

export interface RegisteredFaceData {
  name: string;
  photoUrl: string;
  registeredAt: string;
}

export interface SecurityCredentials {
  face: RegisteredFaceData | null;
  voicePin: string | null;
  password: string | null;
}

export const INITIAL_SECURITY_CREDENTIALS: SecurityCredentials = {
  face: null,
  voicePin: null,
  password: null
};

const ACTIVE_USER_KEY = 'silverhands_active_user_name';
const REGISTRY_KEY = 'silverhands_accounts_registry';

export function normalizeUserName(name: string | null | undefined): string {
  if (!name) return 'default_senior';
  return name.trim().toLowerCase().replace(/\s+/g, '_');
}

export function resetAllAccountsToBlank(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(REGISTRY_KEY);
      localStorage.removeItem(ACTIVE_USER_KEY);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('silverhands_security_credentials');
      localStorage.removeItem('silverhands_user');
    } catch (e) {}
  }
}

export function getActiveUserAccount(): string | null {
  if (typeof window !== 'undefined') {
    try {
      return localStorage.getItem(ACTIVE_USER_KEY) || null;
    } catch (e) {}
  }
  return null;
}

export function setActiveUserAccount(name: string | null): void {
  if (typeof window !== 'undefined') {
    try {
      if (name) {
        localStorage.setItem(ACTIVE_USER_KEY, name);
      } else {
        localStorage.removeItem(ACTIVE_USER_KEY);
      }
    } catch (e) {}
  }
}

export interface UserAccountEntry {
  userName: string;
  profile: ProfileState;
  security: SecurityCredentials;
}

export function getAccountsRegistry(): Record<string, UserAccountEntry> {
  if (typeof window !== 'undefined') {
    try {
      const data = localStorage.getItem(REGISTRY_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.warn('Failed reading accounts registry:', e);
    }
  }
  return {};
}

export function saveAccountsRegistry(registry: Record<string, UserAccountEntry>): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
    } catch (e) {
      console.warn('Failed saving accounts registry:', e);
    }
  }
}

/**
 * Checks if a password is already registered by ANOTHER user account
 */
export function isPasswordUsedByOtherUser(userName: string, passwordInput: string): boolean {
  if (!passwordInput) return false;
  const registry = getAccountsRegistry();
  const currentKey = normalizeUserName(userName);

  for (const key of Object.keys(registry)) {
    if (key !== currentKey) {
      const account = registry[key];
      if (account && account.security && account.security.password === passwordInput) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Automatically finds account matching an entered password
 */
export function findAccountByPassword(passwordInput: string): UserAccountEntry | null {
  if (!passwordInput) return null;
  const cleanInput = passwordInput.trim().toLowerCase();
  const registry = getAccountsRegistry();
  const keys = Object.keys(registry);
  if (keys.length === 0) return null;

  for (const key of keys) {
    const account = registry[key];
    if (account && account.security && account.security.password) {
      const pass = account.security.password.trim().toLowerCase();
      if (pass === cleanInput || pass === cleanInput) {
        return account;
      }
    }
  }

  return null;
}

/**
 * Automatically finds account matching a spoken Voice PIN
 */
export function findAccountByVoicePin(pinInput: string): UserAccountEntry | null {
  if (!pinInput) return null;
  const cleanInput = pinInput.replace(/\D/g, '');
  const rawInput = pinInput.trim().toLowerCase();
  const registry = getAccountsRegistry();
  const keys = Object.keys(registry);

  if (keys.length === 0) return null;

  for (const key of keys) {
    const account = registry[key];
    if (account && account.security && account.security.voicePin) {
      const pinRaw = account.security.voicePin.trim().toLowerCase();
      const pinDigits = pinRaw.replace(/\D/g, '');

      if (
        (cleanInput && pinDigits === cleanInput) ||
        (cleanInput && cleanInput.length >= 4 && pinDigits === cleanInput) ||
        pinRaw === rawInput
      ) {
        return account;
      }
    }
  }

  return null;
}

/**
 * Returns all user accounts that have registered Face ID biometrics
 */
export function getAllRegisteredFaceAccounts(): UserAccountEntry[] {
  const registry = getAccountsRegistry();
  const list: UserAccountEntry[] = [];
  for (const key of Object.keys(registry)) {
    const account = registry[key];
    if (account && account.security && account.security.face) {
      list.push(account);
    }
  }
  return list;
}

export function getSavedProfile(targetUserName?: string): ProfileState {
  const name = targetUserName || getActiveUserAccount() || 'Senior Creator';
  const key = normalizeUserName(name);
  const registry = getAccountsRegistry();
  
  if (registry[key] && registry[key].profile) {
    const p = registry[key].profile;
    return {
      name: p.name || name,
      skill: p.skill || 'Traditional Cooking & Crafts',
      experience_years: p.experience_years || 30,
      location: p.location || 'Mylapore, Chennai',
      language: p.language || 'Tamil & English',
      services: p.services && p.services.length > 0 ? p.services : ['Online Lessons', 'Handmade Products'],
      availability: p.availability || 'Available Daily'
    };
  }
  
  return {
    ...INITIAL_PROFILE_STATE,
    name: name
  };
}

export function registerCompleteUserAccount(params: {
  userName: string;
  profile: ProfileState;
  voicePin?: string | null;
  password?: string | null;
  photoUrl?: string | null;
}): UserAccountEntry {
  const name = params.userName.trim() || 'Senior Creator';
  const key = normalizeUserName(name);
  const registry = getAccountsRegistry();

  const existingEntry = registry[key] || {
    userName: name,
    profile: { ...INITIAL_PROFILE_STATE, name },
    security: { ...INITIAL_SECURITY_CREDENTIALS }
  };

  const updatedProfile: ProfileState = {
    ...existingEntry.profile,
    ...params.profile,
    name: name
  };

  const updatedSecurity: SecurityCredentials = {
    ...existingEntry.security,
    voicePin: params.voicePin !== undefined ? params.voicePin : existingEntry.security.voicePin,
    password: params.password !== undefined ? params.password : existingEntry.security.password,
    face: params.photoUrl ? { name, photoUrl: params.photoUrl, registeredAt: new Date().toISOString() } : existingEntry.security.face
  };

  const entry: UserAccountEntry = {
    userName: name,
    profile: updatedProfile,
    security: updatedSecurity
  };

  registry[key] = entry;
  saveAccountsRegistry(registry);
  setActiveUserAccount(name);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfile));
      // Asynchronously persist all user details, biometrics, PIN, and password to PostgreSQL
      fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: name,
          profile: updatedProfile,
          voicePin: updatedSecurity.voicePin,
          password: updatedSecurity.password,
          photoUrl: updatedSecurity.face?.photoUrl
        })
      }).catch(err => console.warn('[PostgreSQL Sync Warning]:', err));
    } catch (e) {}
  }

  return entry;
}

export function saveProfileState(profile: ProfileState, targetUserName?: string): void {
  const name = profile.name || targetUserName || getActiveUserAccount();
  if (!name) return;

  registerCompleteUserAccount({
    userName: name,
    profile
  });
}

export function getSavedSecurityCredentials(targetUserName?: string): SecurityCredentials {
  const name = targetUserName || getActiveUserAccount();
  if (!name) return { ...INITIAL_SECURITY_CREDENTIALS };

  const key = normalizeUserName(name);
  const registry = getAccountsRegistry();

  if (registry[key] && registry[key].security) {
    return registry[key].security;
  }
  return { ...INITIAL_SECURITY_CREDENTIALS };
}

export function saveSecurityCredentials(creds: SecurityCredentials, targetUserName?: string): void {
  const name = targetUserName || getActiveUserAccount();
  if (!name) return;

  const key = normalizeUserName(name);
  const registry = getAccountsRegistry();
  const existingProfile = registry[key]?.profile || getSavedProfile(name);

  registry[key] = {
    userName: name,
    profile: existingProfile,
    security: creds
  };

  saveAccountsRegistry(registry);
}

export function registerFaceData(name: string, photoUrl: string): RegisteredFaceData {
  const entry = registerCompleteUserAccount({
    userName: name,
    profile: getSavedProfile(name),
    photoUrl
  });
  return entry.security.face!;
}

export function registerVoicePinData(pin: string, targetUserName?: string): string {
  const name = targetUserName || getActiveUserAccount();
  if (!name) return pin;
  registerCompleteUserAccount({
    userName: name,
    profile: getSavedProfile(name),
    voicePin: pin
  });
  return pin;
}

export function registerPasswordData(password: string, targetUserName?: string): string {
  const name = targetUserName || getActiveUserAccount();
  if (!name) return password;
  registerCompleteUserAccount({
    userName: name,
    profile: getSavedProfile(name),
    password
  });
  return password;
}

export class VoiceAgentEngine {
  private currentProfile: ProfileState;
  private conversationHistory: ConversationTurn[];
  private isProcessing: boolean;

  constructor() {
    this.currentProfile = getSavedProfile();
    this.conversationHistory = [];
    this.isProcessing = false;
  }

  public getProfileState(): ProfileState {
    return this.currentProfile;
  }

  public getConversationHistory(): ConversationTurn[] {
    return this.conversationHistory;
  }

  public isBusy(): boolean {
    return this.isProcessing;
  }

  public resetState(): void {
    this.currentProfile = getSavedProfile();
    this.conversationHistory = [];
    this.isProcessing = false;
  }

  public speakQuestion(text: string, onEnd?: () => void): void {
    voiceService.speak(text, 'en-IN', onEnd);
  }

  public async processUserSpeech(userSpeech: string): Promise<AgentTurnResponse> {
    if (this.isProcessing) {
      throw new Error('Voice agent is currently processing previous speech turn.');
    }

    this.isProcessing = true;
    this.conversationHistory.push({ role: 'user', text: userSpeech });

    try {
      const res = await fetch('/api/ai/voice-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_profile: this.currentProfile,
          conversation_history: this.conversationHistory,
          user_speech: userSpeech
        })
      });

      const data = await res.json();

      if (data.success && data.turn) {
        const turn: AgentTurnResponse = data.turn;
        this.currentProfile = turn.updated_profile;
        if (turn.updated_profile.name) {
          saveProfileState(turn.updated_profile, turn.updated_profile.name);
        }
        this.conversationHistory.push({ role: 'assistant', text: turn.next_question });
        return turn;
      } else {
        const fallbackQuestion = "Thank you. Could you tell me more about your skills and experience?";
        this.conversationHistory.push({ role: 'assistant', text: fallbackQuestion });
        return {
          extracted_data: {},
          next_question: fallbackQuestion,
          updated_profile: this.currentProfile,
          completed: false,
          confirmation_mode: false
        };
      }
    } catch (err) {
      console.error('Error processing speech with voice agent API:', err);
      const fallbackQuestion = "I am listening. Please tell me your name or skill.";
      return {
        extracted_data: {},
        next_question: fallbackQuestion,
        updated_profile: this.currentProfile,
        completed: false,
        confirmation_mode: false
      };
    } finally {
      this.isProcessing = false;
    }
  }
}

export const voiceAgent = new VoiceAgentEngine();
