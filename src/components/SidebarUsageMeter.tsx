import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  formatResetDistance,
  resolveModelUsage,
  usageTone,
  usePlanUsageReport,
  type PlanWindow,
} from "@/lib/dynamic-plan-usage";
import { t } from "@/lib/i18n";
import { useAdvancedMode } from "@/lib/interface-mode";
import { useRailPickerSelection } from "@/lib/rail-picker-state";
import { currentTaskBot, useStore, type ModelSelection } from "@/state/store";
import { PresetProviderMark } from "./ProviderIcons";
import type { ProviderIconPreset } from "../../shared/provider-icon";

const DRIVER_PRESETS: Record<string, ProviderIconPreset> = {
  claude: "anthropic",
  codex: "openai",
  grok: "xai",
  antigravity: "google",
};

function MeterBar({
  label,
  window,
  now,
}: {
  label: string;
  window: PlanWindow;
  now: number;
}) {
  if (!window.available) return null;
  const used = window.usedPercent ?? (window.remainingPercent != null ? Math.max(0, 100 - window.remainingPercent) : 0);
  const remaining = window.remainingPercent ?? (window.usedPercent != null ? Math.max(0, 100 - window.usedPercent) : null);
  const when = formatResetDistance(window.resetsAt, now);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-[11px] leading-tight">
        <span className="font-medium text-ink-secondary">{label}</span>
        <div className="flex items-baseline gap-1.5 tabular-nums">
          {remaining != null && (
            <span className="font-medium text-ink">{t("planUsage.left", { remaining: Math.round(remaining) })}</span>
          )}
          {when && <span className="text-[10px] text-ink-secondary">{t("planUsage.resetsIn", { when })}</span>}
        </div>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-inset"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, Math.max(0, used)))}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300", usageTone(used))}
          style={{ width: `${Math.min(100, Math.max(0, used))}%` }}
        />
      </div>
    </div>
  );
}

export function SidebarUsageMeter() {
  const advanced = useAdvancedMode();
  const { state } = useStore();
  const { report } = usePlanUsageReport();
  const railSelection = useRailPickerSelection();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!advanced) {
    return null;
  }

  const bots = Array.isArray(state?.bots) ? state.bots : [];
  const instances = Array.isArray(state?.instances) ? state.instances : [];
  const selectedBot = bots.find((candidate) => candidate.id === state?.selectedId) ?? bots[0];
  const activeBot = selectedBot ? currentTaskBot(selectedBot) : undefined;
  const botSelection = activeBot?.modelSelection;

  const effectiveSelection: ModelSelection | null = railSelection?.instanceId
    ? { instanceId: railSelection.instanceId, model: railSelection.model ?? botSelection?.model ?? "" }
    : botSelection ?? null;

  const meter = resolveModelUsage({
    report,
    selection: effectiveSelection,
    instances,
  });

  if (!meter) {
    return null;
  }

  const preset = DRIVER_PRESETS[meter.driver];

  return (
    <div
      data-testid="sidebar-usage-meter"
      data-sidebar-usage-meter=""
      className="mb-2 flex flex-col gap-2 rounded-xl border border-hairline/40 bg-control/30 p-2.5"
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {preset && <PresetProviderMark preset={preset} size={13} className="shrink-0" />}
          <span className="truncate text-[11px] font-semibold text-ink">{meter.providerName}</span>
        </div>
        {meter.modelLabel && (
          <span className="max-w-[100px] truncate rounded bg-raised px-1 py-0.5 text-[9.5px] font-medium text-ink-secondary">
            {meter.modelLabel}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <MeterBar label={t("planUsage.fiveHour")} window={meter.fiveHour} now={now} />
        <MeterBar label={t("planUsage.weekly")} window={meter.weekly} now={now} />
      </div>
    </div>
  );
}
