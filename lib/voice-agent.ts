import { voiceService } from './voice';

export interface ProfileSkill {
  name: string;
  type?: 'primary' | 'additional';
  experience_years: number | null;
}

export interface ProfileState {
  name: string | null;
  skills?: ProfileSkill[];
  skill?: string | null; // Backwards-compatible primary skill name
  experience_years?: number | null; // Backwards-compatible primary skill experience
  location: string | null;
  structured_location?: any;
  language: string | null;
  services: string[];
  availability: string | null;
}

export interface ConversationTurn {
  role: 'assistant' | 'user';
  text: string;
}

export type ConversationState =
  | 'ASKING_NAME'
  | 'ASKING_SKILL'
  | 'ASKING_EXPERIENCE'
  | 'ASKING_LOCATION'
  | 'CONFIRMING_PROFILE'
  | 'ASKING_CORRECTION'
  | 'CORRECTING_FIELD'
  | 'COMPLETED';

export interface AgentTurnResponse {
  extracted_data: Partial<ProfileState>;
  next_question: string;
  updated_profile: ProfileState;
  completed: boolean;
  confirmation_mode: boolean;
  conversation_state: ConversationState;
  target_field?: string | null;
  active_skill_index?: number;
}

export const INITIAL_PROFILE_STATE: ProfileState = {
  name: null,
  skills: [],
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
  if (!name) return 'anonymous_user';
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
      if (account && account.security && account.security.password && account.security.password.trim().toLowerCase() === passwordInput.trim().toLowerCase()) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if a Voice PIN is already registered by ANOTHER user account
 */
export function isVoicePinUsedByOtherUser(userName: string, pinInput: string): boolean {
  if (!pinInput) return false;
  const cleanInput = pinInput.replace(/\D/g, '');
  const rawInput = pinInput.trim().toLowerCase();
  const registry = getAccountsRegistry();
  const currentKey = normalizeUserName(userName);

  for (const key of Object.keys(registry)) {
    if (key !== currentKey) {
      const account = registry[key];
      if (account && account.security && account.security.voicePin) {
        const pinRaw = account.security.voicePin.trim().toLowerCase();
        const pinDigits = pinRaw.replace(/\D/g, '');
        if ((cleanInput && pinDigits === cleanInput) || pinRaw === rawInput) {
          return true;
        }
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
      if (pass === cleanInput) {
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
  const name = targetUserName || getActiveUserAccount();
  if (!name) return { ...INITIAL_PROFILE_STATE };
  const key = normalizeUserName(name);
  const registry = getAccountsRegistry();
  
  if (registry[key] && registry[key].profile) {
    const p = registry[key].profile;
    return {
      name: p.name || name,
      skill: p.skill || null,
      experience_years: (p.experience_years !== undefined && p.experience_years !== null) ? Number(p.experience_years) : null,
      location: p.location || null,
      language: p.language || null,
      services: p.services || [],
      availability: p.availability || null
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
  const name = params.userName.trim();
  if (!name) {
    throw new Error("User name is required to create an account.");
  }
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
  if (!name) throw new Error('User name is required for face registration');
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
  private candidateProfile: ProfileState;
  private confirmedProfile: ProfileState | null;
  private conversationState: ConversationState;
  private currentQuestion: string;
  private targetField: string | null;
  private activeSkillIndex: number;
  private conversationHistory: ConversationTurn[];
  private isProcessing: boolean;

  constructor() {
    this.candidateProfile = { ...INITIAL_PROFILE_STATE };
    this.confirmedProfile = getSavedProfile();
    this.conversationState = 'ASKING_NAME';
    this.currentQuestion = "Welcome to SilverHands! I will help you create your profile using voice. What is your name?";
    this.targetField = null;
    this.activeSkillIndex = 0;
    this.conversationHistory = [];
    this.isProcessing = false;
  }

  public getProfileState(): ProfileState {
    return this.candidateProfile;
  }

  public getCandidateProfile(): ProfileState {
    return this.candidateProfile;
  }

  public getConfirmedProfile(): ProfileState | null {
    return this.confirmedProfile;
  }

  public getConversationState(): ConversationState {
    return this.conversationState;
  }

  public getCurrentQuestion(): string {
    return this.currentQuestion;
  }

  public getConversationHistory(): ConversationTurn[] {
    return this.conversationHistory;
  }

  public isBusy(): boolean {
    return this.isProcessing;
  }

  public resetState(): void {
    this.candidateProfile = { ...INITIAL_PROFILE_STATE };
    this.confirmedProfile = null;
    this.conversationState = 'ASKING_NAME';
    this.currentQuestion = "Welcome to SilverHands! I will help you create your profile using voice. What is your name?";
    this.targetField = null;
    this.activeSkillIndex = 0;
    this.conversationHistory = [];
    this.isProcessing = false;
  }

  public speakQuestion(text: string, onEnd?: () => void): void {
    this.currentQuestion = text;
    this.conversationHistory.push({ role: 'assistant', text });
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
          conversation_state: this.conversationState,
          current_question: this.currentQuestion,
          confirmed_profile: this.confirmedProfile,
          candidate_profile: this.candidateProfile,
          conversation_history: this.conversationHistory,
          user_speech: userSpeech,
          target_field: this.targetField,
          active_skill_index: this.activeSkillIndex
        })
      });

      const data = await res.json();
      this.isProcessing = false;

      if (data.success && data.turn) {
        const turn: AgentTurnResponse = data.turn;
        this.candidateProfile = turn.updated_profile;
        this.conversationState = turn.conversation_state;
        this.currentQuestion = turn.next_question;
        this.targetField = turn.target_field || null;
        this.activeSkillIndex = turn.active_skill_index !== undefined ? turn.active_skill_index : 0;

        if (turn.completed) {
          this.confirmedProfile = { ...turn.updated_profile };
        }

        return turn;
      } else {
        throw new Error(data.error || 'Failed to process speech turn via AI engine');
      }
    } catch (err) {
      this.isProcessing = false;
      throw err;
    }
  }
}

export const voiceAgent = new VoiceAgentEngine();
