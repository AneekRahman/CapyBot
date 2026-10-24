import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "./i18n";
import { speechService } from "./speech-service";

export function useComposerDictation({ draftId, text, onText, available }: {
  draftId: string;
  text: string;
  onText: (text: string) => void;
  available: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const draft = useRef({ id: draftId, text });
  draft.current = { id: draftId, text };
  const session = useRef({ draftId: "", base: "" });
  const activeSessionRef = useRef(false);
  const stopFnRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    setRecording(false);
    stopFnRef.current?.();
  }, []);

  useEffect(() => {
    if (!recording) return;
    if (session.current.draftId !== draftId) {
      setRecording(false);
      return;
    }
    setSpeechError(null);
    let sessionActive = true;
    activeSessionRef.current = true;
    const base = session.current.base.trim();
    let lastText = session.current.base;

    const hasBridge = typeof window !== "undefined" && typeof window.ogb?.speechStart === "function";
    const service = hasBridge && window.ogb ? {
      start: () => window.ogb!.speechStart(),
      stop: () => window.ogb!.speechStop(),
      onTranscript: (cb: (l: { text?: string; error?: string }) => void) => window.ogb!.onSpeechTranscript(cb),
      onEnd: (cb: (e: { code: number; reason?: string }) => void) => window.ogb!.onSpeechEnd(cb),
    } : {
      start: () => speechService.start(),
      stop: () => speechService.stop(),
      onTranscript: (cb: (l: { text?: string; error?: string }) => void) => speechService.onSpeechTranscript(cb),
      onEnd: (cb: (e: { code: number; reason?: string }) => void) => speechService.onSpeechEnd(cb),
    };

    stopFnRef.current = () => {
      if (!hasBridge) {
        setTranscribing(true);
      }
      void service.stop();
    };

    const cancelSession = () => {
      if (!sessionActive) return;
      sessionActive = false;
      activeSessionRef.current = false;
      void service.stop();
      setRecording(false);
      setTranscribing(false);
    };

    const offTranscript = service.onTranscript((line) => {
      if (!sessionActive || draft.current.id !== draftId) return;
      if (draft.current.text !== lastText) {
        cancelSession();
        return;
      }
      if (typeof line.text !== "string" || !line.text.trim()) return;
      const heard = line.text.trim();
      // If there is no message in the input box, add the transcribed text.
      // If there is already text in the input box, append it.
      lastText = base ? `${base} ${heard}` : heard;
      draft.current.text = lastText;
      onText(lastText);
    });

    const offEnd = service.onEnd(({ code, reason }) => {
      if (!sessionActive || draft.current.id !== draftId) return;
      sessionActive = false;
      activeSessionRef.current = false;
      setRecording(false);
      setTranscribing(false);
      if (code === 2) {
        setSpeechError(t("composer.dictation.macOnly"));
      } else if (code === 1) {
        setSpeechError(t(
          reason === "dictation-disabled"
            ? "composer.dictation.disabled"
            : reason === "speech-not-authorized"
              ? "composer.dictation.permission"
              : "composer.dictation.failed",
        ));
      }
    });

    void service.start().catch(() => {
      if (!sessionActive) return;
      cancelSession();
      setSpeechError(t("composer.dictation.failed"));
    });

    return () => {
      offTranscript();
      offEnd();
      if (sessionActive) {
        sessionActive = false;
        activeSessionRef.current = false;
        void service.stop();
      }
      setTranscribing(false);
    };
  }, [recording, draftId, onText]);

  const toggle = () => {
    const hasBridge = typeof window !== "undefined" && typeof window.ogb?.speechStart === "function";
    const canRun = available && (hasBridge || speechService.isAvailable());
    if (!canRun) {
      setSpeechError(t("composer.dictation.unavailable"));
    } else if (recording) {
      stop();
    } else {
      session.current = { draftId, base: text };
      setRecording(true);
    }
  };

  return { recording, transcribing, speechError, toggle, stop };
}
