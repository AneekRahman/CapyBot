import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/state/store";
import type { InstanceInfo, ModelSelection } from "@/state/store";

export interface PlanWindow {
  available: boolean;
  remainingPercent: number | null;
  usedPercent: number | null;
  resetsAt: string | null;
}

export interface PlanExtra {
  label: string;
  remainingPercent: number;
  usedPercent: number;
  resetsAt: string | null;
}

export interface PlanModelUsage {
  name: string;
  windows: PlanExtra[];
}

export interface PlanProvider {
  id: string;
  name: string;
  driver: string;
  plan: string | null;
  ok: boolean;
  authenticated?: boolean;
  error: string | null;
  fiveHour: PlanWindow;
  weekly: PlanWindow;
  extra: PlanExtra[];
  models?: PlanModelUsage[];
}

export interface PlanUsageReport {
  fetchedAt: string;
  providers: PlanProvider[];
}

export interface ActiveUsageMeter {
  providerId: string;
  providerName: string;
  driver: string;
  plan: string | null;
  modelLabel?: string;
  fiveHour: PlanWindow;
  weekly: PlanWindow;
}

const SUPPORTED_DRIVERS: Record<string, string> = {
  claudeAgent: "claude",
  claude: "claude",
  codex: "codex",
  antigravityAgent: "antigravity",
  antigravity: "antigravity",
  grokAgent: "grok",
  grok: "grok",
};

export function formatResetDistance(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at) || at <= now) return null;
  const minutes = Math.floor((at - now) / 60_000);
  if (minutes < 1) return "less than a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

export function usageTone(used: number): string {
  if (used >= 90) return "bg-danger";
  if (used >= 70) return "bg-warning";
  return "bg-success";
}

let cachedReport: PlanUsageReport | null = null;
let cachedAt = 0;
let inflightFetch: Promise<PlanUsageReport | null> | null = null;
const reportListeners = new Set<() => void>();

function notifyReportListeners(): void {
  for (const listener of reportListeners) {
    listener();
  }
}

export async function fetchPlanUsageReport(refresh = false): Promise<PlanUsageReport | null> {
  const now = Date.now();
  if (!refresh && cachedReport && now - cachedAt < 30_000) {
    return cachedReport;
  }
  if (inflightFetch) {
    return inflightFetch;
  }
  inflightFetch = api<PlanUsageReport>(refresh ? "/api/plan-usage?refresh=1" : "/api/plan-usage")
    .then((data) => {
      cachedReport = data;
      cachedAt = Date.now();
      inflightFetch = null;
      notifyReportListeners();
      return data;
    })
    .catch(() => {
      inflightFetch = null;
      return cachedReport;
    });
  return inflightFetch;
}

export function usePlanUsageReport(): { report: PlanUsageReport | null; refresh: () => void } {
  const report = useSyncExternalStore(
    (notify) => {
      reportListeners.add(notify);
      return () => reportListeners.delete(notify);
    },
    () => cachedReport,
    () => cachedReport,
  );

  useEffect(() => {
    if (!cachedReport || Date.now() - cachedAt >= 30_000) {
      void fetchPlanUsageReport(false);
    }
  }, []);

  return {
    report,
    refresh: () => void fetchPlanUsageReport(true),
  };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[-_/\s]+/g, " ").trim();
}

function modelMatches(name: string, modelId: string): boolean {
  const a = normalize(name);
  const b = normalize(modelId);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function findWindow(windows: PlanExtra[], type: "5h" | "weekly"): PlanWindow | null {
  for (const w of windows) {
    const lbl = w.label.toLowerCase();
    if (type === "5h" && (lbl.includes("5-hour") || lbl.includes("5h") || lbl.includes("five_hour"))) {
      return {
        available: true,
        remainingPercent: w.remainingPercent,
        usedPercent: w.usedPercent,
        resetsAt: w.resetsAt,
      };
    }
    if (type === "weekly" && (lbl.includes("weekly") || lbl.includes("7d") || lbl.includes("seven_day") || lbl.includes("1w"))) {
      return {
        available: true,
        remainingPercent: w.remainingPercent,
        usedPercent: w.usedPercent,
        resetsAt: w.resetsAt,
      };
    }
  }
  return null;
}

export function resolveModelUsage(input: {
  report: PlanUsageReport | null;
  selection?: ModelSelection | null;
  instances?: readonly InstanceInfo[];
}): ActiveUsageMeter | null {
  const { report, selection, instances } = input;
  if (!report || !selection) return null;

  const instance = instances?.find((inst) => inst.instanceId === selection.instanceId);
  const planDriver = (instance?.driverKind && SUPPORTED_DRIVERS[instance.driverKind])
    ?? SUPPORTED_DRIVERS[selection.instanceId];

  const provider = report.providers.find((p) => p.id === selection.instanceId)
    ?? (planDriver ? report.providers.find((p) => p.driver === planDriver) : undefined);

  if (!provider || !provider.ok || provider.authenticated === false) {
    return null;
  }
  if (provider.error && /^Sign in again in /i.test(provider.error)) {
    return null;
  }
  if (!SUPPORTED_DRIVERS[provider.driver]) {
    return null;
  }

  const modelId = selection.model || "";
  let fiveHour: PlanWindow = provider.fiveHour;
  let weekly: PlanWindow = provider.weekly;
  let matchedModelLabel: string | undefined;

  const models = provider.models ?? [];
  if (models.length > 0) {
    const matched = models.find((m) => modelMatches(m.name, modelId));
    if (matched) {
      matchedModelLabel = matched.name;
      const m5h = findWindow(matched.windows, "5h");
      const mWeekly = findWindow(matched.windows, "weekly");
      if (m5h?.available) fiveHour = m5h;
      if (mWeekly?.available) weekly = mWeekly;
    } else if (provider.driver === "antigravity") {
      const geminiGroup = models.find((m) => /gemini/i.test(m.name));
      if (geminiGroup) {
        matchedModelLabel = geminiGroup.name;
        const g5h = findWindow(geminiGroup.windows, "5h");
        const gWeekly = findWindow(geminiGroup.windows, "weekly");
        if (g5h?.available) fiveHour = g5h;
        if (gWeekly?.available) weekly = gWeekly;
      }
    }
  }

  if (provider.driver === "antigravity" && !matchedModelLabel) {
    matchedModelLabel = "Gemini models";
  }

  if (!fiveHour.available && !weekly.available) {
    return null;
  }

  return {
    providerId: provider.id,
    providerName: provider.name,
    driver: provider.driver,
    plan: provider.plan,
    modelLabel: matchedModelLabel,
    fiveHour,
    weekly,
  };
}
