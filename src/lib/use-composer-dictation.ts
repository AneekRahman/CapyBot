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

  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const sessionRef = useRef<{
    id: number;
    draftId: string;
    base: string;
    lastText: string;
    active: boolean;
    unsubTranscript?: () => void;
    unsubEnd?: () => void;
  }>({
    id: 0,
    draftId: "",
    base: "",
    lastText: "",
    active: false,
  });

  const getService = useCallback(() => {
    const hasBridge = typeof window !== "undefined" && typeof window.ogb?.speechStart === "function";
    if (hasBridge && window.ogb) {
      return {
        hasBridge: true,
        start: () => window.ogb!.speechStart(),
        stop: () => window.ogb!.speechStop(),
        onTranscript: (cb: (l: { text?: string; error?: string }) => void) => window.ogb!.onSpeechTranscript(cb),
        onEnd: (cb: (e: { code: number; reason?: string }) => void) => window.ogb!.onSpeechEnd(cb),
      };
    }
    return {
      hasBridge: false,
      start: () => speechService.start(),
      stop: () => speechService.stop(),
      onTranscript: (cb: (l: { text?: string; error?: string }) => void) => speechService.onSpeechTranscript(cb),
      onEnd: (cb: (e: { code: number; reason?: string }) => void) => speechService.onSpeechEnd(cb),
    };
  }, []);

  const cancelSession = useCallback(() => {
    const current = sessionRef.current;
    if (!current.active) return;
    current.active = false;
    current.unsubTranscript?.();
    current.unsubEnd?.();
    current.unsubTranscript = undefined;
    current.unsubEnd = undefined;
    setRecording(false);
    setTranscribing(false);
    const service = getService();
    void service.stop();
  }, [getService]);

  const stop = useCallback(() => {
    cancelSession();
  }, [cancelSession]);

  const startSession = useCallback(() => {
    setSpeechError(null);
    cancelSession();

    const service = getService();
    const sessionId = sessionRef.current.id + 1;
    const currentDraftId = draftId;
    const baseText = draft.current.text;

    sessionRef.current = {
      id: sessionId,
      draftId: currentDraftId,
      base: baseText,
      lastText: baseText,
      active: true,
    };

    const offTranscript = service.onTranscript((line) => {
      const sess = sessionRef.current;
      if (!sess.active || sess.id !== sessionId || sess.draftId !== currentDraftId) return;

      if (service.hasBridge) {
        if (draft.current.text !== sess.lastText) {
          cancelSession();
          return;
        }
        if (typeof line.text !== "string" || !line.text.trim()) return;
        const base = sess.base;
        sess.lastText = base ? `${base}${/\s$/.test(base) ? "" : " "}${line.text}` : line.text;
        draft.current.text = sess.lastText;
        onTextRef.current(sess.lastText);
      } else {
        if (typeof line.text !== "string" || !line.text.trim()) return;
        const heard = line.text.trim();
        const base = sess.base.trim();
        const newText = base ? `${base} ${heard}` : heard;
        sess.lastText = newText;
        draft.current.text = newText;
        onTextRef.current(newText);
      }
    });

    const offEnd = service.onEnd(({ code, reason }) => {
      const sess = sessionRef.current;
      if (!sess.active || sess.id !== sessionId || sess.draftId !== currentDraftId) return;
      sess.active = false;
      sess.unsubTranscript?.();
      sess.unsubEnd?.();
      sess.unsubTranscript = undefined;
      sess.unsubEnd = undefined;
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

    sessionRef.current.unsubTranscript = offTranscript;
    sessionRef.current.unsubEnd = offEnd;
    setRecording(true);
    setTranscribing(false);

    void service.start().catch(() => {
      const sess = sessionRef.current;
      if (!sess.active || sess.id !== sessionId) return;
      cancelSession();
      setSpeechError(t("composer.dictation.failed"));
    });
  }, [draftId, cancelSession, getService]);

  const finishRecording = useCallback(() => {
    const sess = sessionRef.current;
    if (!sess.active) return;
    const service = getService();
    if (service.hasBridge) {
      cancelSession();
    } else {
      setRecording(false);
      setTranscribing(true);
      void service.stop();
    }
  }, [cancelSession, getService]);

  const toggle = useCallback(() => {
    if (transcribing) return;
    const hasBridge = typeof window !== "undefined" && typeof window.ogb?.speechStart === "function";
    const canRun = available && (hasBridge || speechService.isAvailable());
    if (!canRun) {
      setSpeechError(t("composer.dictation.unavailable"));
      return;
    }
    if (recording) {
      finishRecording();
    } else {
      startSession();
    }
  }, [available, recording, transcribing, startSession, finishRecording]);

  useEffect(() => {
    return () => {
      if (sessionRef.current.active) {
        cancelSession();
      }
    };
  }, [draftId, cancelSession]);

  return { recording, transcribing, speechError, toggle, stop };
}
