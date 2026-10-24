import { hasPriorRun } from "./prior-run";

export const SKIN_IDS = [
  "pop",
  "midnight",
  "graphite",
  "meadow",
  "mocha",
  "stealth",
  "dracula",
  "synthwave",
  "vesper",
  "halloween",
] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export type Skin = {
  id: SkinId;
  name: string;
  tagline: string;
};

export const SKINS: readonly Skin[] = [
  { id: "pop", name: "Pop", tagline: "Cream paper, thick ink outlines, hard shadows. Chunky and cheerful." },
  { id: "midnight", name: "Midnight", tagline: "The original. Cool and dark." },
  { id: "graphite", name: "Graphite", tagline: "Quiet charcoal and softened steel blue." },
  { id: "meadow", name: "Meadow", tagline: "Fresh white with a calm green. The MausBot look." },
  { id: "mocha", name: "Mocha", tagline: "Soothing dark pastel with lavender warmth. Easy on the eyes." },
  { id: "stealth", name: "Stealth", tagline: "Pitch-black OLED with razor hairlines and electric blurple." },
  { id: "dracula", name: "Dracula", tagline: "Gothic dark slate lit with vibrant neon purple and pink." },
  { id: "synthwave", name: "Synthwave", tagline: "1980s neon arcade. Deep twilight glowing in electric cyan and magenta." },
  { id: "vesper", name: "Vesper", tagline: "Ultra-minimal pitch charcoal with warm glowing amber." },
  { id: "halloween", name: "Halloween", tagline: "Plum after dark, lit in pumpkin orange. Bats optional." },
];

export const DEFAULT_SKIN: SkinId = "meadow";
export const PRIOR_INSTALL_SKIN: SkinId = "midnight";

const KEY = "omb-skin";

function isSkinId(value: unknown): value is SkinId {
  return SKIN_IDS.includes(value as SkinId);
}

// With storage blocked the localStorage getter itself throws, and `typeof` alone doesn't shield it.
function getStore(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function readSkin(): SkinId {
  try {
    const store = getStore();
    const stored = store?.getItem(KEY);
    if (isSkinId(stored)) return stored;
    return hasPriorRun(store) ? PRIOR_INSTALL_SKIN : DEFAULT_SKIN;
  } catch {
    return PRIOR_INSTALL_SKIN;
  }
}

export function applySkin(id: SkinId): void {
  document.documentElement.dataset.skin = id;
  try {
    getStore()?.setItem(KEY, id);
  } catch {
  }
  // On Windows the caption buttons sit in a native overlay the main process paints, out of CSS's reach.
  try {
    void window.ogb?.applySkin?.(id)?.catch(() => undefined);
  } catch {
  }
}
