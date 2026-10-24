import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPlanUsageCache,
  fetchPlanUsageReport,
  formatResetDistance,
  resolveModelUsage,
  USAGE_METER_POLL_INTERVAL_MS,
  usageTone,
  type PlanProvider,
  type PlanUsageReport,
} from "./dynamic-plan-usage";
import type { InstanceInfo, ModelSelection } from "@/state/store";

const apiMock = vi.fn();
vi.mock("@/state/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/state/store")>(),
  api: (...args: unknown[]) => apiMock(...args),
}));

function window(usedPercent: number | null, resetsAt: string | null = null) {
  return {
    available: usedPercent != null,
    remainingPercent: usedPercent != null ? 100 - usedPercent : null,
    usedPercent,
    resetsAt,
  };
}

function fixtureReport(providers: Partial<PlanProvider>[] = []): PlanUsageReport {
  return {
    fetchedAt: new Date().toISOString(),
    providers: providers.map((p, index) => ({
      id: p.id ?? `provider-${index}`,
      name: p.name ?? "Test Provider",
      driver: p.driver ?? "codex",
      plan: p.plan ?? "Pro",
      ok: p.ok ?? true,
      authenticated: p.authenticated ?? true,
      error: p.error ?? null,
      fiveHour: p.fiveHour ?? window(25, "2026-10-24T12:00:00Z"),
      weekly: p.weekly ?? window(40, "2026-10-30T12:00:00Z"),
      extra: p.extra ?? [],
      models: p.models ?? [],
    })),
  };
}

function fixtureInstance(id: string, driverKind: string, displayName = id): InstanceInfo {
  return {
    instanceId: id,
    driverKind,
    displayName,
    models: {
      default: "default-model",
      options: [{ id: "default-model", name: "Default Model" }],
    },
    snapshot: { state: "available", authenticated: true },
  } as unknown as InstanceInfo;
}

describe("formatResetDistance", () => {
  it("formats future reset timestamps nicely", () => {
    const now = Date.parse("2026-10-24T10:00:00Z");
    expect(formatResetDistance("2026-10-24T10:00:30Z", now)).toBe("less than a minute");
    expect(formatResetDistance("2026-10-24T10:45:00Z", now)).toBe("45m");
    expect(formatResetDistance("2026-10-24T12:30:00Z", now)).toBe("2h 30m");
    expect(formatResetDistance("2026-10-26T14:00:00Z", now)).toBe("2d 4h");
  });

  it("returns null for past or missing timestamps", () => {
    const now = Date.parse("2026-10-24T10:00:00Z");
    expect(formatResetDistance(null, now)).toBeNull();
    expect(formatResetDistance("2026-10-24T09:00:00Z", now)).toBeNull();
  });
});

describe("usageTone", () => {
  it("returns color tokens corresponding to consumption thresholds", () => {
    expect(usageTone(30)).toBe("bg-success");
    expect(usageTone(75)).toBe("bg-warning");
    expect(usageTone(92)).toBe("bg-danger");
  });
});

describe("resolveModelUsage", () => {
  it("matches Codex model and resolves its windows", () => {
    const report = fixtureReport([
      {
        id: "codex",
        driver: "codex",
        name: "Codex",
        fiveHour: window(35),
        weekly: window(50),
        models: [
          {
            name: "o3-mini",
            windows: [
              { label: "5-hour", remainingPercent: 80, usedPercent: 20, resetsAt: null },
              { label: "Weekly", remainingPercent: 60, usedPercent: 40, resetsAt: null },
            ],
          },
        ],
      },
    ]);
    const instances = [fixtureInstance("codex", "codex")];
    const selection: ModelSelection = { instanceId: "codex", model: "o3-mini" };

    const resolved = resolveModelUsage({ report, selection, instances });
    expect(resolved).not.toBeNull();
    expect(resolved?.providerName).toBe("Codex");
    expect(resolved?.modelLabel).toBe("o3-mini");
    expect(resolved?.fiveHour.usedPercent).toBe(20);
    expect(resolved?.weekly.usedPercent).toBe(40);
  });

  it("defaults to Gemini models quota for Google Gemini accounts", () => {
    const report = fixtureReport([
      {
        id: "antigravity",
        driver: "antigravity",
        name: "Aneek8 (primary@example.test)",
        fiveHour: window(15, "2026-10-24T15:00:00Z"),
        weekly: window(30, "2026-10-31T15:00:00Z"),
      },
    ]);
    const instances = [fixtureInstance("antigravity", "antigravityAgent", "Google Gemini")];
    const selection: ModelSelection = { instanceId: "antigravity", model: "gemini-2.5-pro" };

    const resolved = resolveModelUsage({ report, selection, instances });
    expect(resolved).not.toBeNull();
    expect(resolved?.providerName).toBe("Aneek8 (primary@example.test)");
    expect(resolved?.modelLabel).toBe("Gemini models");
    expect(resolved?.fiveHour.usedPercent).toBe(15);
    expect(resolved?.weekly.usedPercent).toBe(30);
  });

  it("resolves specific Gemini model if present in models breakdown", () => {
    const report = fixtureReport([
      {
        id: "antigravity",
        driver: "antigravity",
        name: "Aneek8",
        fiveHour: window(10),
        weekly: window(20),
        models: [
          {
            name: "Gemini 2.5 Pro",
            windows: [
              { label: "5-hour", remainingPercent: 75, usedPercent: 25, resetsAt: null },
              { label: "Weekly", remainingPercent: 55, usedPercent: 45, resetsAt: null },
            ],
          },
        ],
      },
    ]);
    const instances = [fixtureInstance("antigravity", "antigravityAgent")];
    const selection: ModelSelection = { instanceId: "antigravity", model: "gemini-2.5-pro" };

    const resolved = resolveModelUsage({ report, selection, instances });
    expect(resolved?.modelLabel).toBe("Gemini 2.5 Pro");
    expect(resolved?.fiveHour.usedPercent).toBe(25);
    expect(resolved?.weekly.usedPercent).toBe(45);
  });

  it("switches to Claude and GPT models quota when Claude is selected on Antigravity", () => {
    const report = fixtureReport([
      {
        id: "antigravity",
        driver: "antigravity",
        name: "Aneek8",
        fiveHour: window(18, "2026-10-24T01:19:18Z"),
        weekly: window(74, "2026-10-24T11:49:27Z"),
        models: [
          {
            name: "Claude and GPT models",
            windows: [
              { label: "5-hour", remainingPercent: 100, usedPercent: 0, resetsAt: "2026-10-24T01:58:22Z" },
              { label: "Weekly", remainingPercent: 49, usedPercent: 51, resetsAt: "2026-10-25T06:24:39Z" },
            ],
          },
        ],
      },
    ]);
    const instances = [fixtureInstance("antigravity", "antigravityAgent")];

    const claudeResolved = resolveModelUsage({
      report,
      selection: { instanceId: "antigravity", model: "claude-3-5-sonnet" },
      instances,
    });
    expect(claudeResolved?.modelLabel).toBe("Claude and GPT models");
    expect(claudeResolved?.fiveHour.usedPercent).toBe(0);
    expect(claudeResolved?.fiveHour.resetsAt).toBe("2026-10-24T01:58:22Z");
    expect(claudeResolved?.weekly.usedPercent).toBe(51);
    expect(claudeResolved?.weekly.resetsAt).toBe("2026-10-25T06:24:39Z");

    const geminiResolved = resolveModelUsage({
      report,
      selection: { instanceId: "antigravity", model: "gemini-2.5-pro" },
      instances,
    });
    expect(geminiResolved?.modelLabel).toBe("Gemini models");
    expect(geminiResolved?.fiveHour.usedPercent).toBe(18);
    expect(geminiResolved?.fiveHour.resetsAt).toBe("2026-10-24T01:19:18Z");
    expect(geminiResolved?.weekly.usedPercent).toBe(74);
    expect(geminiResolved?.weekly.resetsAt).toBe("2026-10-24T11:49:27Z");
  });

  it("differentiates between multiple Gemini accounts by instanceId", () => {
    const report = fixtureReport([
      {
        id: "antigravity-1",
        driver: "antigravity",
        name: "Aneek8 (Personal)",
        fiveHour: window(10),
        weekly: window(20),
      },
      {
        id: "antigravity-2",
        driver: "antigravity",
        name: "Aneek10 (Work)",
        fiveHour: window(85),
        weekly: window(90),
      },
    ]);
    const instances = [
      fixtureInstance("antigravity-1", "antigravityAgent"),
      fixtureInstance("antigravity-2", "antigravityAgent"),
    ];

    const resolved1 = resolveModelUsage({
      report,
      selection: { instanceId: "antigravity-1", model: "gemini-2.5-flash" },
      instances,
    });
    expect(resolved1?.providerName).toBe("Aneek8 (Personal)");
    expect(resolved1?.fiveHour.usedPercent).toBe(10);

    const resolved2 = resolveModelUsage({
      report,
      selection: { instanceId: "antigravity-2", model: "gemini-2.5-flash" },
      instances,
    });
    expect(resolved2?.providerName).toBe("Aneek10 (Work)");
    expect(resolved2?.fiveHour.usedPercent).toBe(85);
  });

  it("returns null for unsupported providers or local models", () => {
    const report = fixtureReport([
      { id: "codex", driver: "codex", fiveHour: window(20), weekly: window(30) },
    ]);
    const instances = [
      fixtureInstance("ollama", "customAgent", "Ollama Local"),
      fixtureInstance("openrouter", "openaiCompatibleAgent", "OpenRouter"),
    ];

    expect(resolveModelUsage({ report, selection: { instanceId: "ollama", model: "llama3" }, instances })).toBeNull();
    expect(resolveModelUsage({ report, selection: { instanceId: "openrouter", model: "deepseek" }, instances })).toBeNull();
  });

  it("returns null when provider is unauthenticated or signed out", () => {
    const report = fixtureReport([
      { id: "claude", driver: "claude", authenticated: false, fiveHour: window(20) },
      { id: "codex", driver: "codex", ok: false, error: "Sign in again in Codex", fiveHour: window(20) },
    ]);
    const instances = [
      fixtureInstance("claude", "claudeAgent"),
      fixtureInstance("codex", "codex"),
    ];

    expect(resolveModelUsage({ report, selection: { instanceId: "claude", model: "sonnet" }, instances })).toBeNull();
    expect(resolveModelUsage({ report, selection: { instanceId: "codex", model: "gpt-4o" }, instances })).toBeNull();
  });

  it("returns null when neither fiveHour nor weekly window is available", () => {
    const report = fixtureReport([
      { id: "codex", driver: "codex", fiveHour: window(null), weekly: window(null) },
    ]);
    const instances = [fixtureInstance("codex", "codex")];

    expect(resolveModelUsage({ report, selection: { instanceId: "codex", model: "gpt-4o" }, instances })).toBeNull();
  });
});

describe("fetchPlanUsageReport and cache", () => {
  beforeEach(() => {
    clearPlanUsageCache();
    apiMock.mockReset();
  });

  it("exports USAGE_METER_POLL_INTERVAL_MS as 1 minute (60,000ms)", () => {
    expect(USAGE_METER_POLL_INTERVAL_MS).toBe(60_000);
  });

  it("fetches /api/plan-usage and caches the report for 30 seconds", async () => {
    const report = fixtureReport([{ id: "codex", driver: "codex" }]);
    apiMock.mockResolvedValueOnce(report);

    const first = await fetchPlanUsageReport(false);
    expect(apiMock).toHaveBeenCalledWith("/api/plan-usage");
    expect(first).toEqual(report);

    // Call again immediately: should return cached result without hitting API
    const second = await fetchPlanUsageReport(false);
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(report);
  });

  it("hard refresh (refresh = true) bypasses cache and calls /api/plan-usage?refresh=1", async () => {
    const initialReport = fixtureReport([{ id: "codex", driver: "codex", fiveHour: window(20) }]);
    const refreshedReport = fixtureReport([{ id: "codex", driver: "codex", fiveHour: window(35) }]);
    apiMock.mockResolvedValueOnce(initialReport);
    apiMock.mockResolvedValueOnce(refreshedReport);

    await fetchPlanUsageReport(false);
    expect(apiMock).toHaveBeenCalledWith("/api/plan-usage");

    // Perform hard refresh
    const refreshed = await fetchPlanUsageReport(true);
    expect(apiMock).toHaveBeenCalledWith("/api/plan-usage?refresh=1");
    expect(refreshed).toEqual(refreshedReport);
  });

  it("clearPlanUsageCache resets cached report", async () => {
    const report = fixtureReport([{ id: "codex", driver: "codex" }]);
    apiMock.mockResolvedValue(report);

    await fetchPlanUsageReport(false);
    expect(apiMock).toHaveBeenCalledTimes(1);

    clearPlanUsageCache();

    await fetchPlanUsageReport(false);
    expect(apiMock).toHaveBeenCalledTimes(2);
  });
});
