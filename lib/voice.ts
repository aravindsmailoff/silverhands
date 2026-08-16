// Unified Voice Module: Centralized Audio Lifecycle & Speech Isolation
// Guarantees zero acoustic feedback loop between Assistant TTS and SpeechRecognition

export interface VoiceRecognitionResult {
  transcript: string;
  isFinal: boolean;
}

export interface VoiceServiceOptions {
  onResult: (result: VoiceRecognitionResult) => void;
  onError: (error: string) => void;
  onEnd: () => void;
  language?: string;
}

export type VoiceState = 'IDLE' | 'AI_SPEAKING' | 'COOLDOWN' | 'LISTENING' | 'PROCESSING';

export class VoiceService {
  private recognition: any = null;
  private isListeningActive: boolean = false;
  private voiceState: VoiceState = 'IDLE';
  private currentTurnId: number = 0;
  private cooldownTimer: any = null;
  private activeOptions: VoiceServiceOptions | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
      }
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && (!!this.recognition || !!process.env.NEXT_PUBLIC_SARVAM_API_KEY);
  }

  public getState(): VoiceState {
    return this.voiceState;
  }

  public getTurnId(): number {
    return this.currentTurnId;
  }

  public isSpeaking(): boolean {
    return this.voiceState === 'AI_SPEAKING' || (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking);
  }

  /**
   * Immediately terminates and aborts any active SpeechRecognition session.
   * Increments the turn epoch so any delayed pending browser callbacks are discarded.
   */
  public stopListening(): void {
    if (this.isListeningActive || this.voiceState === 'LISTENING') {
      console.log(`[VOICE] microphone_stop { turn_id: ${this.currentTurnId}, timestamp: ${Date.now()}, agent_state: '${this.voiceState}' }`);
    }
    this.isListeningActive = false;
    this.currentTurnId++; // Invalidate stale callbacks

    if (this.cooldownTimer) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }

    if (this.recognition) {
      try {
        this.recognition.abort(); // Immediately aborts buffered speech
      } catch (err) {
        // Safe ignore
      }
    }
    this.voiceState = 'IDLE';
  }

  /**
   * Starts listening to user microphone with strict state isolation.
   * Will refuse to start if assistant is currently speaking.
   */
  public startListening(options: VoiceServiceOptions): void {
    if (typeof window === 'undefined') return;

    // Safety Gate 1: If assistant is currently speaking or in cooldown, do not open mic
    if (this.isSpeaking() || this.voiceState === 'COOLDOWN') {
      console.warn(`[VOICE] microphone_start_blocked { turn_id: ${this.currentTurnId}, reason: 'AI is speaking or in cooldown', agent_state: '${this.voiceState}' }`);
      return;
    }

    if (!this.recognition) {
      options.onError('Browser Speech Recognition is not supported on this browser. Try Chrome or Edge.');
      return;
    }

    // Stop any existing session
    this.stopListening();

    this.activeOptions = options;
    const sessionTurnId = ++this.currentTurnId;
    this.voiceState = 'LISTENING';
    this.isListeningActive = true;
    console.log(`[VOICE] microphone_start { turn_id: ${sessionTurnId}, timestamp: ${Date.now()}, agent_state: 'LISTENING' }`);

    try {
      this.recognition.lang = options.language || 'en-IN'; // English (India) default

      this.recognition.onresult = (event: any) => {
        // Safety Gate 2: Discard callback if turnId expired or state is not LISTENING
        if (sessionTurnId !== this.currentTurnId || this.voiceState !== 'LISTENING' || !this.isListeningActive) {
          console.log(`[VOICE] stale_recognition_discarded { session_turn: ${sessionTurnId}, current_turn: ${this.currentTurnId}, state: '${this.voiceState}' }`);
          return;
        }

        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = (finalTranscript || interimTranscript).trim();
        if (currentText && this.activeOptions && sessionTurnId === this.currentTurnId) {
          console.log(`[VOICE] recognition_result { turn_id: ${sessionTurnId}, is_final: ${!!finalTranscript}, transcript: "${currentText}" }`);
          this.activeOptions.onResult({
            transcript: currentText,
            isFinal: !!finalTranscript
          });
        }
      };

      this.recognition.onerror = (event: any) => {
        if (sessionTurnId !== this.currentTurnId) return;
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        console.warn(`[VOICE] recognition_error { turn_id: ${sessionTurnId}, error: '${event.error}' }`);
        if (this.activeOptions) {
          this.activeOptions.onError(`Speech recognition notice: ${event.error}`);
        }
      };

      this.recognition.onend = () => {
        // If still meant to be listening and not interrupted by speaking/processing, keep clean
        if (sessionTurnId !== this.currentTurnId || this.voiceState !== 'LISTENING' || !this.isListeningActive) {
          this.isListeningActive = false;
          return;
        }
        this.isListeningActive = false;
        if (this.activeOptions) {
          this.activeOptions.onEnd();
        }
      };

      try {
        this.recognition.start();
      } catch (startErr: any) {
        if (!startErr.message?.includes('already started')) {
          throw startErr;
        }
      }
    } catch (err: any) {
      this.isListeningActive = false;
      this.voiceState = 'IDLE';
      options.onError(err.message || 'Failed to start voice recognition');
    }
  }

  /**
   * Speaks text using SpeechSynthesis with strict microphone mute and post-speech cooldown.
   * AI voice will NEVER be heard or transcribed by the speech recognition engine.
   */
  public speak(text: string, lang: string = 'en-IN', onEnd?: () => void, cooldownMs: number = 500): void {
    if (typeof window === 'undefined') {
      if (onEnd) onEnd();
      return;
    }

    // 1. Immediately abort microphone capture and invalidate buffered speech
    this.stopListening();
    this.voiceState = 'AI_SPEAKING';
    const speechTurnId = ++this.currentTurnId;
    console.log(`[VOICE] assistant_tts_start { turn_id: ${speechTurnId}, timestamp: ${Date.now()}, agent_state: 'AI_SPEAKING', text: "${text.slice(0, 50)}..." }`);

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any pending utterances

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.92; // Elder-friendly pacing

      const handleSpeechComplete = () => {
        if (speechTurnId !== this.currentTurnId) return;

        console.log(`[VOICE] assistant_tts_end { turn_id: ${speechTurnId}, timestamp: ${Date.now()}, agent_state: 'COOLDOWN', cooldown_ms: ${cooldownMs} }`);
        // Transition to COOLDOWN state to ensure speaker echo disappears from room
        this.voiceState = 'COOLDOWN';

        this.cooldownTimer = setTimeout(() => {
          if (speechTurnId === this.currentTurnId) {
            this.voiceState = 'IDLE';
            if (onEnd) {
              onEnd();
            }
          }
        }, cooldownMs);
      };

      utterance.onend = handleSpeechComplete;
      utterance.onerror = (err) => {
        console.warn(`[VOICE] assistant_tts_error { turn_id: ${speechTurnId}, error: ${err} }`);
        handleSpeechComplete();
      };

      window.speechSynthesis.speak(utterance);
    } else {
      this.voiceState = 'IDLE';
      if (onEnd) onEnd();
    }
  }
}

export const voiceService = new VoiceService();
