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
  skill: null,
  experience_years: null,
  location: null,
  language: null,
  services: [],
  availability: null
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
  const registry = getAccountsRegistry();
  for (const key of Object.keys(registry)) {
    const account = registry[key];
    if (account && account.security && account.security.password === passwordInput) {
      return account;
    }
  }
  return null;
}

/**
 * Automatically finds account matching a spoken Voice PIN
 */
export function findAccountByVoicePin(pinInput: string): UserAccountEntry | null {
  if (!pinInput) return null;
  const registry = getAccountsRegistry();
  for (const key of Object.keys(registry)) {
    const account = registry[key];
    if (account && account.security && account.security.voicePin === pinInput) {
      return account;
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
  const name = targetUserName || getActiveUserAccount();
  if (!name) return { ...INITIAL_PROFILE_STATE };
  
  const key = normalizeUserName(name);
  const registry = getAccountsRegistry();
  
  if (registry[key] && registry[key].profile) {
    return registry[key].profile;
  }
  
  return {
    ...INITIAL_PROFILE_STATE,
    name: name,
    skill: 'Crafts & Cooking'
  };
}

export function saveProfileState(profile: ProfileState, targetUserName?: string): void {
  const name = profile.name || targetUserName || getActiveUserAccount();
  if (!name) return;

  setActiveUserAccount(name);
  const key = normalizeUserName(name);
  
  const registry = getAccountsRegistry();
  const existingSecurity = registry[key]?.security || { ...INITIAL_SECURITY_CREDENTIALS };

  registry[key] = {
    userName: name,
    profile,
    security: existingSecurity
  };

  saveAccountsRegistry(registry);
  
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {}
  }
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
  setActiveUserAccount(name);
  const current = getSavedSecurityCredentials(name);
  const face: RegisteredFaceData = {
    name,
    photoUrl,
    registeredAt: new Date().toISOString()
  };
  
  const updatedSecurity = { ...current, face };
  saveSecurityCredentials(updatedSecurity, name);

  const currentProfile = getSavedProfile(name);
  saveProfileState({ ...currentProfile, name }, name);

  return face;
}

export function registerVoicePinData(pin: string, targetUserName?: string): string {
  const name = targetUserName || getActiveUserAccount();
  if (!name) return pin;
  const current = getSavedSecurityCredentials(name);
  saveSecurityCredentials({ ...current, voicePin: pin }, name);
  return pin;
}

export function registerPasswordData(password: string, targetUserName?: string): string {
  const name = targetUserName || getActiveUserAccount();
  if (!name) return password;
  const current = getSavedSecurityCredentials(name);
  saveSecurityCredentials({ ...current, password }, name);
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

  public async speakQuestion(text?: string, onEndCallback?: () => void): Promise<void> {
    const q = text || "Welcome to SilverHands! What is your name and expertise?";
    voiceService.speak(q, 'en-IN');
    if (onEndCallback) {
      setTimeout(onEndCallback, 2000);
    }
  }

  public async processUserSpeech(userSpeechText: string): Promise<AgentTurnResponse> {
    this.isProcessing = true;
    this.conversationHistory.push({ role: 'user', text: userSpeechText });

    const activeUser = getActiveUserAccount() || 'Senior Creator';
    const profile = getSavedProfile(activeUser);

    if (!profile.name) {
      profile.name = userSpeechText;
    } else if (!profile.skill) {
      profile.skill = userSpeechText;
    }

    saveProfileState(profile, activeUser);
    this.currentProfile = profile;
    this.isProcessing = false;

    const reply = `Thank you ${profile.name || ''}. Your profile has been updated.`;
    voiceService.speak(reply, 'en-IN');
    this.conversationHistory.push({ role: 'assistant', text: reply });

    return {
      extracted_data: profile,
      next_question: "Is there anything else you would like to add?",
      updated_profile: profile,
      completed: true,
      confirmation_mode: false
    };
  }
}

export const voiceAgent = new VoiceAgentEngine();
