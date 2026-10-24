import { useEffect, useRef, useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { api, useStore } from "@/state/store";
import { t } from "@/lib/i18n";
import { openExternalLink } from "@/lib/app-links";

export function GoogleSignInPaste({ inWeb, callbackUrl, setCallbackUrl, onSend, busy }: {
  inWeb: boolean;
  callbackUrl: string;
  setCallbackUrl: (value: string) => void;
  onSend: () => void;
  busy: "install" | "signin" | "complete" | "check" | null;
}) {
  const fields = (
    <>
      <input
        value={callbackUrl}
        onChange={(event) => setCallbackUrl(event.target.value)}
        placeholder="http://127.0.0.1:…/?code=…"
        className="mt-2 w-full rounded-md border border-hairline bg-inset px-2 py-1.5 text-[11px] text-ink outline-none focus:border-accent"
      />
      <button
        type="button"
        disabled={!callbackUrl.trim() || busy !== null}
        onClick={onSend}
        className="mt-2 w-full rounded-md bg-control px-2 py-1.5 font-medium text-ink disabled:opacity-50"
      >
        {busy === "complete" ? t("engineSetup.sending") : t("engineSetup.sendRedirect")}
      </button>
    </>
  );
  if (!inWeb) {
    return (
      <details className="rounded-lg border border-hairline/50 bg-app px-2.5 py-2 text-[11.5px] text-ink-secondary">
        <summary className="cursor-pointer select-none">{t("engineSetup.otherComputer")}</summary>
        <p className="mt-2 leading-relaxed">{t("engineSetup.otherComputerHint")}</p>
        {fields}
      </details>
    );
  }
  return (
    <div data-engine-signin-paste className="rounded-lg border border-hairline/50 bg-app px-2.5 py-2 text-[11.5px] text-ink-secondary">
      <p className="leading-relaxed">{t("engineSetup.googleRedirectExpected")}</p>
      <p className="mt-1.5 leading-relaxed">{t("engineSetup.googleRedirectPaste")}</p>
      {fields}
    </div>
  );
}

export function GoogleSignIn({
  instanceId,
  autoStart = false,
  onDone,
}: {
  instanceId: string;
  autoStart?: boolean;
  onDone?: () => void;
}) {
  const { state, refreshInstances, refreshModels } = useStore();
  const [busy, setBusy] = useState<"signin" | "complete" | "check" | null>(autoStart ? "signin" : null);
  const [error, setError] = useState<string | null>(null);
  const [flow, setFlow] = useState<{ flowId: string; authorizationUrl: string } | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const started = useRef(false);
  const inWeb = !window.ogb?.openExternal;

  const currentInstance = state.instances.find((i) => i.instanceId === instanceId);
  const isAuthenticated = currentInstance?.snapshot.authenticated === true;

  const checkDone = async () => {
    await refreshInstances().catch(() => {});
    await refreshModels(instanceId).catch(() => {});
    onDone?.();
  };

  useEffect(() => {
    if (!flow || isAuthenticated) return;
    const timer = window.setInterval(async () => {
      await refreshInstances().catch(() => {});
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [flow, isAuthenticated, refreshInstances]);

  useEffect(() => {
    if (flow && isAuthenticated) {
      setFlow(null);
      void checkDone();
    }
  }, [flow, isAuthenticated]);

  const signIn = async () => {
    setBusy("signin");
    setError(null);
    try {
      const { auth } = await api(`/api/instances/${encodeURIComponent(instanceId)}/auth/start`, { method: "POST" });
      if (auth.phase === "succeeded") {
        await checkDone();
        return;
      }
      if (!auth.flowId || !auth.authorizationUrl) throw new Error(t("engineSetup.googleNoLink"));
      setFlow({ flowId: auth.flowId, authorizationUrl: auth.authorizationUrl });
      await openExternalLink(auth.authorizationUrl).catch(() => {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void signIn();
  }, [autoStart]);

  const complete = async () => {
    if (!flow) return;
    setBusy("complete");
    setError(null);
    try {
      await api(`/api/instances/${encodeURIComponent(instanceId)}/auth/complete`, {
        method: "POST",
        body: JSON.stringify({ flowId: flow.flowId, callbackUrl }),
      });
      setCallbackUrl("");
      await checkDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const check = async () => {
    setBusy("check");
    setError(null);
    try {
      await checkDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-hairline/50 bg-app p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void signIn()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
        >
          {busy === "signin" ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
          {busy === "signin"
            ? t("engineSetup.startingGoogle")
            : flow
              ? t("engineSetup.openGoogleAgain")
              : t("engineSetup.signInGoogle")}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            disabled={busy !== null}
            className="rounded-lg px-2.5 py-2 text-[12px] text-ink-secondary hover:bg-control disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
        )}
      </div>
      {busy === "signin" && <p role="status" className="text-[11.5px] text-ink-secondary">{t("engineSetup.antigravitySlow")}</p>}
      {flow && (
        <>
          <button
            type="button"
            onClick={() => void check()}
            disabled={busy !== null}
            className="w-full rounded-lg bg-control px-3 py-2 text-[12px] font-semibold text-ink hover:bg-raised-hover disabled:opacity-50"
          >
            {busy === "check" ? <Loader2 size={13} className="inline animate-spin" /> : t("engineSetup.finishedSignIn")}
          </button>
          <GoogleSignInPaste
            inWeb={inWeb}
            callbackUrl={callbackUrl}
            setCallbackUrl={setCallbackUrl}
            onSend={() => void complete()}
            busy={busy}
          />
        </>
      )}
      {error && <p role="alert" className="text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}
