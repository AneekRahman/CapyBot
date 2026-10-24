import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRailPickerPreview } from "@/lib/rail-picker-state";
import { SidebarUsageMeter } from "./SidebarUsageMeter";

const fixture = vi.hoisted(() => ({
  advanced: true,
  state: {} as Record<string, unknown>,
  report: null as unknown,
}));

vi.mock("@/lib/interface-mode", () => ({
  useAdvancedMode: () => fixture.advanced,
}));

vi.mock("@/state/store", () => ({
  useStore: () => ({ state: fixture.state }),
  currentTaskBot: (bot: unknown) => bot,
}));

vi.mock("@/lib/dynamic-plan-usage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dynamic-plan-usage")>();
  return {
    ...actual,
    usePlanUsageReport: () => ({ report: fixture.report, refresh: vi.fn() }),
  };
});

function setupFixture(options: {
  advanced?: boolean;
  modelSelection?: { instanceId: string; model: string };
  providers?: Array<Record<string, unknown>>;
  instances?: Array<Record<string, unknown>>;
} = {}) {
  fixture.advanced = options.advanced ?? true;
  const instances = options.instances ?? [
    { instanceId: "codex", driverKind: "codex", displayName: "Codex" },
    { instanceId: "antigravity", driverKind: "antigravityAgent", displayName: "Google Gemini" },
    { instanceId: "claude", driverKind: "claudeAgent", displayName: "Claude Code" },
    { instanceId: "ollama", driverKind: "customAgent", displayName: "Ollama Local" },
  ];
  const modelSelection = options.modelSelection ?? { instanceId: "codex", model: "o3-mini" };
  fixture.state = {
    selectedId: "bot-1",
    bots: [{ id: "bot-1", modelSelection, tasks: [] }],
    instances,
  };
  fixture.report = {
    fetchedAt: new Date().toISOString(),
    providers: options.providers ?? [
      {
        id: "codex",
        name: "Codex",
        driver: "codex",
        ok: true,
        authenticated: true,
        fiveHour: { available: true, usedPercent: 20, remainingPercent: 80, resetsAt: "2026-10-24T12:00:00Z" },
        weekly: { available: true, usedPercent: 40, remainingPercent: 60, resetsAt: "2026-10-30T12:00:00Z" },
        extra: [],
        models: [],
      },
      {
        id: "antigravity",
        name: "Aneek8 (primary@example.test)",
        driver: "antigravity",
        ok: true,
        authenticated: true,
        fiveHour: { available: true, usedPercent: 10, remainingPercent: 90, resetsAt: "2026-10-24T15:00:00Z" },
        weekly: { available: true, usedPercent: 30, remainingPercent: 70, resetsAt: "2026-10-31T15:00:00Z" },
        extra: [],
        models: [],
      },
    ],
  };
}

describe("SidebarUsageMeter", () => {
  beforeEach(() => {
    setRailPickerPreview(null);
    setupFixture();
  });

  it("renders 5-hour and weekly meters when advanced mode is enabled", () => {
    setupFixture({ advanced: true, modelSelection: { instanceId: "codex", model: "o3-mini" } });
    const html = renderToStaticMarkup(createElement(SidebarUsageMeter));

    expect(html).toContain('data-sidebar-usage-meter=""');
    expect(html).toContain("Codex");
    expect(html).toContain("5-hour");
    expect(html).toContain("Weekly");
    expect(html).toContain("80% left");
    expect(html).toContain("60% left");
    expect(html).toContain('role="meter"');
  });

  it("does not render in Simple mode (advanced: false)", () => {
    setupFixture({ advanced: false });
    const html = renderToStaticMarkup(createElement(SidebarUsageMeter));

    expect(html).toBe("");
  });

  it("defaults to 'Gemini models' for Google Gemini Antigravity account", () => {
    setupFixture({
      modelSelection: { instanceId: "antigravity", model: "gemini-2.5-pro" },
    });
    const html = renderToStaticMarkup(createElement(SidebarUsageMeter));

    expect(html).toContain("Aneek8 (primary@example.test)");
    expect(html).toContain("Gemini models");
    expect(html).toContain("90% left");
    expect(html).toContain("70% left");
  });

  it("dynamically changes along with the live Rail Model Picker preview selection", () => {
    setupFixture({
      modelSelection: { instanceId: "codex", model: "o3-mini" },
    });

    const initialHtml = renderToStaticMarkup(createElement(SidebarUsageMeter));
    expect(initialHtml).toContain("Codex");
    expect(initialHtml).not.toContain("Aneek8");

    // User switches rail in ModelPicker to Gemini
    setRailPickerPreview({ instanceId: "antigravity", model: "gemini-2.5-flash" });
    const switchedHtml = renderToStaticMarkup(createElement(SidebarUsageMeter));
    expect(switchedHtml).toContain("Aneek8");
    expect(switchedHtml).toContain("Gemini models");

    // Picker closes
    setRailPickerPreview(null);
    const revertedHtml = renderToStaticMarkup(createElement(SidebarUsageMeter));
    expect(revertedHtml).toContain("Codex");
  });

  it("hides when selected model is local or unsupported", () => {
    setupFixture({
      modelSelection: { instanceId: "ollama", model: "llama3" },
    });
    const html = renderToStaticMarkup(createElement(SidebarUsageMeter));

    expect(html).toBe("");
  });

  it("hides when provider is unauthenticated or has an error requiring sign-in", () => {
    setupFixture({
      modelSelection: { instanceId: "codex", model: "gpt-4o" },
      providers: [
        {
          id: "codex",
          name: "Codex",
          driver: "codex",
          ok: false,
          error: "Sign in again in Codex",
          fiveHour: { available: true, usedPercent: 10 },
          weekly: { available: true, usedPercent: 10 },
        },
      ],
    });
    const html = renderToStaticMarkup(createElement(SidebarUsageMeter));

    expect(html).toBe("");
  });
});
