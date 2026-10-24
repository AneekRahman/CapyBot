import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSpeechBridge, speechService } from "./speech-service";

describe("speechService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await speechService.stop();
  });

  it("reports availability when Web Speech API is present", () => {
    const fakeRec = vi.fn();
    vi.stubGlobal("SpeechRecognition", fakeRec);
    expect(speechService.isAvailable()).toBe(true);
    expect(speechService.isWebSpeechSupported()).toBe(true);
  });

  it("reports availability when webkitSpeechRecognition is present", () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    vi.stubGlobal("webkitSpeechRecognition", vi.fn());
    expect(speechService.isAvailable()).toBe(true);
    expect(speechService.isWebSpeechSupported()).toBe(true);
  });

  it("reports server transcribe availability when MediaRecorder is present", () => {
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn() } });
    vi.stubGlobal("MediaRecorder", vi.fn());
    expect(speechService.isServerTranscribeSupported()).toBe(true);
    expect(speechService.isAvailable()).toBe(true);
  });

  it("prioritizes MediaRecorder when available and falls back to Web Speech", async () => {
    speechService.resetServerCheck();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: true }),
    }));
    const mockGetUserMedia = vi.fn().mockRejectedValue(new Error("mic blocked"));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: mockGetUserMedia } });

    let startedWebSpeech = false;
    class MockFallbackRecognition {
      continuous = false;
      interimResults = false;
      onstart = () => {};
      start() {
        startedWebSpeech = true;
        setTimeout(() => this.onstart(), 0);
      }
      stop() {}
    }

    vi.stubGlobal("SpeechRecognition", MockFallbackRecognition);
    vi.stubGlobal("MediaRecorder", vi.fn());

    await speechService.start();

    expect(mockGetUserMedia).toHaveBeenCalled();
    expect(startedWebSpeech).toBe(true);
  });

  it("falls back to Web Speech immediately when server transcribe is unconfigured", async () => {
    speechService.resetServerCheck();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: false }),
    }));
    const mockGetUserMedia = vi.fn();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: mockGetUserMedia } });

    let startedWebSpeech = false;
    class MockFallbackRecognition {
      continuous = false;
      interimResults = false;
      onstart = () => {};
      start() {
        startedWebSpeech = true;
        setTimeout(() => this.onstart(), 0);
      }
      stop() {}
    }

    vi.stubGlobal("SpeechRecognition", MockFallbackRecognition);
    vi.stubGlobal("MediaRecorder", vi.fn());

    await speechService.start();

    expect(mockGetUserMedia).not.toHaveBeenCalled();
    expect(startedWebSpeech).toBe(true);
  });

  it("polyfills window.ogb speech APIs when absent", () => {
    const fakeWindow: any = {};
    vi.stubGlobal("window", fakeWindow);
    ensureSpeechBridge();
    expect(typeof fakeWindow.ogb?.speechStart).toBe("function");
    expect(typeof fakeWindow.ogb?.speechStop).toBe("function");
    expect(typeof fakeWindow.ogb?.onSpeechTranscript).toBe("function");
    expect(typeof fakeWindow.ogb?.onSpeechEnd).toBe("function");
  });

  it("preserves native desktop window.ogb speech APIs when already present", () => {
    const nativeStart = vi.fn();
    const nativeStop = vi.fn();
    vi.stubGlobal("window", {
      ogb: {
        platform: "darwin",
        speechStart: nativeStart,
        speechStop: nativeStop,
      },
    });
    ensureSpeechBridge();
    expect(window.ogb?.speechStart).toBe(nativeStart);
    expect(window.ogb?.speechStop).toBe(nativeStop);
  });

  it("delivers interim and final speech transcripts", async () => {
    let onresultCb: ((event: any) => void) | null = null;

    class MockRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onstart = () => {};
      onresult = () => {};
      onend = () => {};
      onerror = () => {};
      start() {
        onresultCb = this.onresult;
        setTimeout(() => this.onstart(), 0);
      }
      stop() {
        if (this.onend) setTimeout(() => this.onend(), 0);
      }
    }

    vi.stubGlobal("SpeechRecognition", MockRecognition);
    vi.stubGlobal("window", { SpeechRecognition: MockRecognition });

    const transcripts: Array<{ text?: string; partial?: boolean }> = [];
    const unsubscribe = speechService.onSpeechTranscript((line) => {
      transcripts.push(line);
    });

    await speechService.start({ endpointMs: 150 });

    expect(onresultCb).not.toBeNull();

    // Simulate interim transcript
    onresultCb!({
      resultIndex: 0,
      results: [
        [{ transcript: "hello" }],
      ],
    });

    expect(transcripts.length).toBe(1);
    expect(transcripts[0]).toEqual({ text: "hello", partial: true });

    // Wait for endpoint timer to fire and emit final
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(transcripts.length).toBe(2);
    expect(transcripts[1]).toEqual({ text: "hello", partial: false });

    unsubscribe();
  });

  it("records audio via MediaRecorder and transcribes with /api/speech/transcribe on stop", async () => {
    speechService.resetServerCheck();
    let fetchCalled = false;
    let fetchBody: any = null;
    const mockFetch = vi.fn().mockImplementation(async (url: string, init?: any) => {
      if (url === "/api/speech/transcribe" && (!init || init.method === "GET")) {
        return { ok: true, json: async () => ({ available: true, engine: "elevenlabs" }) };
      }
      if (url === "/api/speech/transcribe" && init?.method === "POST") {
        fetchCalled = true;
        fetchBody = init.body;
        return { ok: true, json: async () => ({ text: "Transcribed from ElevenLabs" }) };
      }
      return { ok: false };
    });
    vi.stubGlobal("fetch", mockFetch);
    if (typeof window !== "undefined") {
      (window as any).fetch = mockFetch;
    }

    const mockTrack = { stop: vi.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    const mockGetUserMedia = vi.fn().mockResolvedValue(mockStream);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: mockGetUserMedia,
      },
    });
    if (typeof window !== "undefined") {
      (window as any).navigator = { mediaDevices: { getUserMedia: mockGetUserMedia } };
    }

    let mockRecorderInstance: any = null;
    const captureInstance = (inst: any) => { mockRecorderInstance = inst; };
    class MockMediaRecorder {
      state = "recording";
      mimeType = "audio/webm";
      ondataavailable: ((e: any) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor() {
        captureInstance(this);
      }
      start() {}
      stop() {
        this.state = "inactive";
        if (this.ondataavailable) {
          this.ondataavailable({ data: new Blob(["audio-content"], { type: "audio/webm" }) });
        }
        if (this.onstop) {
          setTimeout(() => this.onstop!(), 0);
        }
      }
    }

    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    if (typeof window !== "undefined") {
      (window as any).MediaRecorder = MockMediaRecorder;
    }

    const transcripts: Array<{ text?: string; partial?: boolean }> = [];
    const ends: Array<{ code: number | null }> = [];
    const unsubTranscript = speechService.onSpeechTranscript((l) => transcripts.push(l));
    const unsubEnd = speechService.onSpeechEnd((e) => ends.push(e));

    await speechService.start();
    expect(mockRecorderInstance).not.toBeNull();

    await speechService.stop();

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchCalled).toBe(true);
    expect(fetchBody).toBeDefined();
    expect(transcripts).toEqual([{ text: "Transcribed from ElevenLabs", partial: false }]);
    expect(ends).toEqual([{ code: 0 }]);
    expect(mockTrack.stop).toHaveBeenCalled();

    unsubTranscript();
    unsubEnd();
  });
});
