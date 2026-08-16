// Unified Voice Module (Sarvam AI ASR/TTS API + Web Speech Fallback)

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

export class VoiceService {
  private recognition: any = null;
  private isListening: boolean = false;

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

  public startListening(options: VoiceServiceOptions): void {
    const apiKey = process.env.NEXT_PUBLIC_SARVAM_API_KEY;

    if (apiKey) {
      // TODO: Sarvam AI API ASR Integration point
      console.log('[VoiceService] Sarvam AI API Key detected - Using Sarvam ASR API');
    }

    // Web Speech API fallback interface (or primary client voice capture)
    if (!this.recognition) {
      options.onError('Browser Speech Recognition is not supported on this browser. Try Chrome/Edge.');
      return;
    }

    try {
      this.recognition.lang = options.language || 'en-IN'; // English (India) default
      
      this.recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const currentText = finalTranscript || interimTranscript;
        if (currentText) {
          options.onResult({
            transcript: currentText,
            isFinal: !!finalTranscript
          });
        }
      };

      this.recognition.onerror = (event: any) => {
        console.warn('[VoiceService] Speech recognition error:', event.error);
        options.onError(`Speech recognition error: ${event.error}`);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        options.onEnd();
      };

      this.recognition.start();
      this.isListening = true;
    } catch (err: any) {
      options.onError(err.message || 'Failed to start voice recognition');
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (err) {
        console.warn('[VoiceService] Error stopping recognition:', err);
      }
      this.isListening = false;
    }
  }

  public speak(text: string, lang: string = 'en-IN', onEnd?: () => void): void {
    if (typeof window === 'undefined') return;

    // TODO: Sarvam TTS API integration point if SARVAM_API_KEY is present
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 0.9; // Slightly slower for clear elder comprehension
      if (onEnd) {
        utterance.onend = () => {
          onEnd();
        };
      }
      window.speechSynthesis.speak(utterance);
    } else if (onEnd) {
      onEnd();
    }
  }
}

export const voiceService = new VoiceService();
