import { useSyncExternalStore } from "react";

export interface RailPickerSelection {
  instanceId: string;
  model?: string;
}

let currentPreview: RailPickerSelection | null = null;
const subscribers = new Set<() => void>();

export function setRailPickerPreview(selection: RailPickerSelection | null): void {
  if (
    currentPreview?.instanceId === selection?.instanceId &&
    currentPreview?.model === selection?.model
  ) {
    return;
  }
  currentPreview = selection;
  for (const notify of subscribers) {
    notify();
  }
}

export function readRailPickerPreview(): RailPickerSelection | null {
  return currentPreview;
}

export function useRailPickerSelection(): RailPickerSelection | null {
  return useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    readRailPickerPreview,
    readRailPickerPreview,
  );
}
