// @vitest-environment happy-dom
import { createElement, useEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useComposerDictation } from "./use-composer-dictation";
import { speechService } from "./speech-service";

describe("useComposerDictation", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("window", { ...globalThis.window });
    delete (window as any).ogb;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("adds transcribed text to an empty message input box", async () => {
    let transcriptCb: ((l: { text: string }) => void) | null = null;
    let endCb: ((e: { code: number }) => void) | null = null;

    vi.spyOn(speechService, "isAvailable").mockReturnValue(true);
    vi.spyOn(speechService, "start").mockImplementation(async () => {});
    vi.spyOn(speechService, "stop").mockImplementation(async () => {});
    vi.spyOn(speechService, "onSpeechTranscript").mockImplementation((cb) => {
      transcriptCb = cb;
      return () => {};
    });
    vi.spyOn(speechService, "onSpeechEnd").mockImplementation((cb) => {
      endCb = cb;
      return () => {};
    });

    const onText = vi.fn();
    let hookResult: ReturnType<typeof useComposerDictation> | null = null;

    function TestComp() {
      hookResult = useComposerDictation({
        draftId: "draft-1",
        text: "",
        onText,
        available: true,
      });
      return null;
    }

    flushSync(() => root.render(createElement(TestComp)));

    flushSync(() => {
      hookResult?.toggle();
    });

    expect(hookResult?.recording).toBe(true);

    flushSync(() => {
      transcriptCb?.({ text: "Hello world" });
    });

    expect(onText).toHaveBeenCalledWith("Hello world");

    flushSync(() => {
      endCb?.({ code: 0 });
    });

    expect(hookResult?.recording).toBe(false);
  });

  it("appends transcribed text with space when message input box already has text", async () => {
    let transcriptCb: ((l: { text: string }) => void) | null = null;
    let endCb: ((e: { code: number }) => void) | null = null;

    vi.spyOn(speechService, "isAvailable").mockReturnValue(true);
    vi.spyOn(speechService, "start").mockImplementation(async () => {});
    vi.spyOn(speechService, "stop").mockImplementation(async () => {});
    vi.spyOn(speechService, "onSpeechTranscript").mockImplementation((cb) => {
      transcriptCb = cb;
      return () => {};
    });
    vi.spyOn(speechService, "onSpeechEnd").mockImplementation((cb) => {
      endCb = cb;
      return () => {};
    });

    const onText = vi.fn();
    let hookResult: ReturnType<typeof useComposerDictation> | null = null;

    function TestComp() {
      hookResult = useComposerDictation({
        draftId: "draft-2",
        text: "Initial message draft",
        onText,
        available: true,
      });
      return null;
    }

    flushSync(() => root.render(createElement(TestComp)));

    flushSync(() => {
      hookResult?.toggle();
    });

    expect(hookResult?.recording).toBe(true);

    flushSync(() => {
      transcriptCb?.({ text: "and additional voice input" });
    });

    expect(onText).toHaveBeenCalledWith("Initial message draft and additional voice input");

    flushSync(() => {
      endCb?.({ code: 0 });
    });

    expect(hookResult?.recording).toBe(false);
  });
});
