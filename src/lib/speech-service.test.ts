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
});
