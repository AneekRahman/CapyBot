// Unified Speech Recognition client: bridges native desktop Electron (Apple speech),
// browser-native Web Speech API, and server-backed Amazon Transcribe fallback.

export interface SpeechTranscriptLine {
  partial?: boolean;
  text?: string;
  error?: string;
}

export interface SpeechEndInfo {
  code: number | null;
  reason?: string;
}

export type SpeechTranscriptListener = (line: SpeechTranscriptLine) => void;
export type SpeechEndListener = (info: SpeechEndInfo) => void;

export interface SpeechServiceOptions {
  endpointMs?: number;
  lang?: string;
}

function getGlobal(): any {
  return typeof window !== "undefined" ? window : globalThis;
}

class SpeechService {
  private transcriptListeners = new Set<SpeechTranscriptListener>();
  private endListeners = new Set<SpeechEndListener>();
  private active = false;
  private recognizer: any = null;
  private endpointTimer: any = null;
  private lastPartialText = "";
  private accumulatedFinalText = "";
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private mediaStream: MediaStream | null = null;
  private audioContext: any = null;
  private vadInterval: any = null;
  private silenceTimer: any = null;
  private nativeDesktop = false;

  setNativeDesktop(isNative: boolean) {
    this.nativeDesktop = isNative;
  }

  isAvailable(): boolean {
    const g = getGlobal();
    if (this.nativeDesktop && typeof g.ogb?.speechStart === "function") return true;
    const hasMedia = Boolean(g.navigator?.mediaDevices?.getUserMedia);
    const hasWebSpeech = Boolean(g.SpeechRecognition || g.webkitSpeechRecognition);
    return hasMedia || hasWebSpeech;
  }

  isServerTranscribeSupported(): boolean {
    const g = getGlobal();
    return Boolean(g.navigator?.mediaDevices?.getUserMedia && typeof g.MediaRecorder !== "undefined");
  }

  isWebSpeechSupported(): boolean {
    const g = getGlobal();
    return Boolean(g.SpeechRecognition || g.webkitSpeechRecognition);
  }

  onSpeechTranscript(listener: SpeechTranscriptListener): () => void {
    this.transcriptListeners.add(listener);
    return () => {
      this.transcriptListeners.delete(listener);
    };
  }

  onSpeechEnd(listener: SpeechEndListener): () => void {
    this.endListeners.add(listener);
    return () => {
      this.endListeners.delete(listener);
    };
  }

  emitTranscript(line: SpeechTranscriptLine): void {
    for (const listener of Array.from(this.transcriptListeners)) {
      try {
        listener(line);
      } catch (err) {
        console.error("Speech transcript listener error:", err);
      }
    }
  }

  emitEnd(info: SpeechEndInfo): void {
    for (const listener of Array.from(this.endListeners)) {
      try {
        listener(info);
      } catch (err) {
        console.error("Speech end listener error:", err);
      }
    }
  }

  async start(options?: SpeechServiceOptions): Promise<void> {
    const g = getGlobal();
    if (this.nativeDesktop && typeof g.ogb?.speechStart === "function") {
      return g.ogb.speechStart(options);
    }

    if (this.active) {
      await this.stop();
    }

    this.active = true;
    this.lastPartialText = "";
    this.accumulatedFinalText = "";

    // 1. Primary option: Server-backed /api/speech/transcribe via MediaRecorder
    if (this.isServerTranscribeSupported()) {
      try {
        await this.startMediaRecorder(options);
        return;
      } catch (err) {
        console.warn("MediaRecorder start failed, falling back to Web Speech API:", err);
      }
    }

    // 2. Fallback option: Native browser Web Speech API
    const SpeechRec = g.SpeechRecognition || g.webkitSpeechRecognition;
    if (SpeechRec) {
      return this.startWebSpeech(SpeechRec, options);
    }

    this.active = false;
    throw new Error("No speech recognition engine available in this browser.");
  }

  private startWebSpeech(SpeechRec: new () => any, options?: SpeechServiceOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        const g = getGlobal();
        const recognition = new SpeechRec();
        this.recognizer = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = options?.lang || (g.document && g.document.documentElement?.lang) || "en-US";

        const endpointMs = options?.endpointMs;

        const clearEndpoint = () => {
          if (this.endpointTimer) {
            clearTimeout(this.endpointTimer);
            this.endpointTimer = null;
          }
        };

        const scheduleEndpoint = (currentText: string) => {
          if (!endpointMs || !currentText.trim()) return;
          clearEndpoint();
          this.endpointTimer = setTimeout(() => {
            if (!this.active) return;
            const text = currentText.trim();
            if (text) {
              this.emitTranscript({ text, partial: false });
            }
            this.stop().catch(() => {});
          }, endpointMs);
        };

        recognition.onstart = () => {
          resolve();
        };

        recognition.onresult = (event: any) => {
          if (!this.active) return;
          let interim = "";
          let final = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const item = event.results[i];
            const transcript = item[0]?.transcript || "";
            if (item.isFinal) {
              final += transcript;
            } else {
              interim += transcript;
            }
          }

          if (final) {
            this.accumulatedFinalText = this.accumulatedFinalText
              ? `${this.accumulatedFinalText} ${final.trim()}`
              : final.trim();
          }

          const currentTotal = [this.accumulatedFinalText, interim.trim()].filter(Boolean).join(" ");
          this.lastPartialText = currentTotal;

          if (currentTotal) {
            this.emitTranscript({ text: currentTotal, partial: true });
            scheduleEndpoint(currentTotal);
          }
        };

        recognition.onerror = (event: any) => {
          clearEndpoint();
          const errorName = event.error || "unknown-error";
          if (errorName === "no-speech") {
            return;
          }
          if (errorName === "not-allowed" || errorName === "service-not-allowed") {
            this.emitTranscript({ error: "speech-not-authorized" });
            this.emitEnd({ code: 1, reason: "speech-not-authorized" });
          } else {
            this.emitTranscript({ error: errorName });
            this.emitEnd({ code: 1, reason: errorName });
          }
        };

        recognition.onend = () => {
          clearEndpoint();
          if (this.active) {
            const remaining = this.lastPartialText.trim();
            if (remaining && endpointMs) {
              this.emitTranscript({ text: remaining, partial: false });
            }
            this.active = false;
            this.recognizer = null;
            this.emitEnd({ code: 0 });
          }
        };

        recognition.start();
      } catch (err) {
        reject(err);
      }
    });
  }

  private clearVad(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }

  private async startMediaRecorder(options?: SpeechServiceOptions): Promise<void> {
    const g = getGlobal();
    if (!g.navigator?.mediaDevices?.getUserMedia) {
      throw new Error("Microphone access is not supported in this browser.");
    }
    const stream = await g.navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaStream = stream;
    this.audioChunks = [];

    const recorder = new MediaRecorder(stream);
    this.mediaRecorder = recorder;

    const AudioCtx = g.AudioContext || g.webkitAudioContext;
    if (typeof AudioCtx === "function" && options?.endpointMs) {
      try {
        const audioContext = new AudioCtx();
        this.audioContext = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let hasSpoken = false;

        this.vadInterval = setInterval(() => {
          if (!this.active || !this.mediaRecorder) {
            this.clearVad();
            return;
          }
          analyser.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const v = (dataArray[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          if (rms > 0.025) {
            hasSpoken = true;
            if (this.silenceTimer) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }
          } else if (hasSpoken) {
            if (!this.silenceTimer) {
              this.silenceTimer = setTimeout(() => {
                if (this.active) {
                  this.stop().catch(() => {});
                }
              }, options.endpointMs);
            }
          }
        }, 80);
      } catch {
        // Fallback gracefully without VAD if AudioContext fails
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.audioChunks.push(e.data);
    };

    recorder.onstop = async () => {
      this.clearVad();
      const audioBlob = new Blob(this.audioChunks, { type: recorder.mimeType || "audio/webm" });
      this.audioChunks = [];
      if (this.mediaStream) {
        for (const track of this.mediaStream.getTracks()) track.stop();
        this.mediaStream = null;
      }
      this.mediaRecorder = null;

      try {
        const response = await fetch("/api/speech/transcribe", {
          method: "POST",
          headers: { "Content-Type": audioBlob.type },
          body: audioBlob,
        });
        if (response.ok) {
          const data = await response.json();
          if (data.text) {
            this.emitTranscript({ text: data.text, partial: false });
          }
          this.emitEnd({ code: 0 });
        } else {
          const err = await response.json().catch(() => ({}));
          const message = err?.error?.message || "Transcription failed";
          this.emitTranscript({ error: message });
          this.emitEnd({ code: 1, reason: message });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Network error during transcription";
        this.emitTranscript({ error: message });
        this.emitEnd({ code: 1, reason: message });
      }
    };

    recorder.start();
  }

  async stop(): Promise<void> {
    const g = getGlobal();
    if (this.nativeDesktop && typeof g.ogb?.speechStop === "function") {
      return g.ogb.speechStop();
    }
    this.active = false;
    this.clearVad();
    if (this.endpointTimer) {
      clearTimeout(this.endpointTimer);
      this.endpointTimer = null;
    }
    if (this.recognizer) {
      try {
        this.recognizer.stop();
      } catch {}
      this.recognizer = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      try {
        this.mediaRecorder.stop();
      } catch {}
    }
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) track.stop();
      this.mediaStream = null;
    }
  }
}

export const speechService = new SpeechService();

/**
 * Polyfill window.ogb speech APIs if running in browser where desktop bridge is absent.
 */
export function ensureSpeechBridge(): void {
  const g = getGlobal();
  if (!g.ogb) {
    g.ogb = {};
  }
  const ogb = g.ogb;

  // If running in macOS desktop Electron with native speech helper, mark native and do not overwrite.
  if (ogb.platform === "darwin" && typeof ogb.speechStart === "function" && ogb.__polyfilled !== true) {
    speechService.setNativeDesktop(true);
    return;
  }

  ogb.__polyfilled = true;
  ogb.speechStart = (options?: SpeechServiceOptions) => speechService.start(options);
  ogb.speechStop = () => speechService.stop();
  ogb.onSpeechTranscript = (cb: SpeechTranscriptListener) => speechService.onSpeechTranscript(cb);
  ogb.onSpeechEnd = (cb: SpeechEndListener) => speechService.onSpeechEnd(cb);
}
