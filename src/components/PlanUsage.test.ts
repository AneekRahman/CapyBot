import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ report: null as unknown, instances: [] as any[] }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial === null ? fixture.report : initial === true ? false : typeof initial === "function" ? (initial as () => unknown)() : initial, () => {}],
}));
vi.mock("@/state/store", () => ({ api: vi.fn(), useStore: () => ({ state: { instances: fixture.instances } }) }));
import { PlanUsage } from "./PlanUsage";

describe("Plan usage presentation", () => {
  it("distinguishes remaining account allowance, per-model usage, and unavailable windows", () => {
    fixture.report = {
      fetchedAt: "2026-10-02T09:00:00Z",
      providers: [{
        id: "fixture", name: "Fixture provider", driver: "claude", plan: "Pro", ok: true, error: null,
        fiveHour: { available: true, remainingPercent: 68, usedPercent: 32, resetsAt: null },
        weekly: { available: false, remainingPercent: null, usedPercent: null, resetsAt: null }, extra: [],
        models: [{ name: "Sonnet", windows: [{ label: "Weekly", remainingPercent: 30, usedPercent: 70, resetsAt: null }] }],
      }],
    };
    const html = renderToStaticMarkup(createElement(PlanUsage));
    expect(html).toContain("68% left");
    expect(html).toContain("70% used");
    expect(html).toContain("Not reported by this plan");
    expect(html).not.toContain("100% left");
    expect(html).toContain('aria-valuenow="32"');
    expect(html).toContain('aria-valuenow="70"');
  });

  it("shows an account error without inventing zero usage", () => {
    fixture.report = { providers: [{ id: "fixture", name: "Fixture provider", ok: false, error: "Sign in to this account." }] };
    const html = renderToStaticMarkup(createElement(PlanUsage));
    expect(html).toContain("Sign in to this account.");
    expect(html).not.toContain('role="meter"');
    expect(html).not.toContain("100% left");
  });

  it("hides models and providers that are not signed in", () => {
    fixture.report = {
      fetchedAt: "2026-10-24T00:00:00Z",
      providers: [
        {
          id: "claude",
          name: "Claude",
          driver: "claude",
          plan: "Pro",
          ok: true,
          authenticated: true,
          error: null,
          fiveHour: { available: true, remainingPercent: 80, usedPercent: 20, resetsAt: null },
          weekly: { available: true, remainingPercent: 70, usedPercent: 30, resetsAt: null },
          extra: [],
        },
        {
          id: "codex",
          name: "Codex",
          driver: "codex",
          plan: null,
          ok: false,
          authenticated: false,
          error: "Sign in again in Codex",
          fiveHour: { available: false, remainingPercent: null, usedPercent: null, resetsAt: null },
          weekly: { available: false, remainingPercent: null, usedPercent: null, resetsAt: null },
          extra: [],
        },
        {
          id: "gemini-unsigned",
          name: "Google Gemini",
          driver: "antigravity",
          plan: null,
          ok: false,
          authenticated: false,
          error: "Sign in again in Google Gemini",
          fiveHour: { available: false, remainingPercent: null, usedPercent: null, resetsAt: null },
          weekly: { available: false, remainingPercent: null, usedPercent: null, resetsAt: null },
          extra: [],
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(PlanUsage));
    expect(html).toContain("Claude");
    expect(html).not.toContain("Sign in again in Codex");
    expect(html).not.toContain("Sign in again in Google Gemini");
    expect(html).not.toContain('data-testid="plan-provider-codex"');
    expect(html).not.toContain('data-testid="plan-provider-gemini-unsigned"');
  });

  it("renders separate meters for each signed in Gemini account", () => {
    fixture.report = {
      fetchedAt: "2026-10-24T00:00:00Z",
      providers: [
        {
          id: "antigravity",
          name: "Google Gemini (Personal)",
          driver: "antigravity",
          plan: "Google AI Pro",
          ok: true,
          authenticated: true,
          error: null,
          fiveHour: { available: true, remainingPercent: 85, usedPercent: 15, resetsAt: null },
          weekly: { available: true, remainingPercent: 62, usedPercent: 38, resetsAt: null },
          extra: [],
          models: [
            {
              name: "Claude and GPT models",
              windows: [{ label: "5-hour", remainingPercent: 20, usedPercent: 80, resetsAt: null }],
            },
          ],
        },
        {
          id: "antigravity-work",
          name: "Work Gemini",
          driver: "antigravity",
          plan: "Google AI Ultra",
          ok: true,
          authenticated: true,
          error: null,
          fiveHour: { available: true, remainingPercent: 95, usedPercent: 5, resetsAt: null },
          weekly: { available: true, remainingPercent: 90, usedPercent: 10, resetsAt: null },
          extra: [],
        },
      ],
    };
    const html = renderToStaticMarkup(createElement(PlanUsage));
    expect(html).toContain("Google Gemini (Personal)");
    expect(html).toContain("Google AI Pro");
    expect(html).toContain("85% left");
    expect(html).toContain("62% left");
    expect(html).toContain("Claude and GPT models");
    expect(html).toContain("80% used");

    expect(html).toContain("Work Gemini");
    expect(html).toContain("Google AI Ultra");
    expect(html).toContain("95% left");
    expect(html).toContain("90% left");
    expect(html).toContain('data-testid="plan-provider-antigravity"');
    expect(html).toContain('data-testid="plan-provider-antigravity-work"');
  });
});
