export type ThemeId =
  | "obsidian" | "midnight" | "forest" | "graphite" | "plum"
  | "parchment" | "sky" | "sage" | "rose";

export interface Theme {
  id: ThemeId;
  label: string;
  dark: boolean;
  // preview swatches: [bg, card, accent-sample, text-sample]
  swatches: [string, string, string, string];
}

export const THEMES: Theme[] = [
  // ── Dark ──────────────────────────────────────────────────────────
  {
    id: "obsidian",
    label: "Obsidian",
    dark: true,
    swatches: ["#0B0D10", "#0F1115", "#C9956B", "#E4DED4"],
  },
  {
    id: "midnight",
    label: "Midnight",
    dark: true,
    swatches: ["#060B1A", "#0A1028", "#7090B8", "#C8D8F8"],
  },
  {
    id: "forest",
    label: "Forest",
    dark: true,
    swatches: ["#070E09", "#0B1510", "#709A7A", "#C8EDCF"],
  },
  {
    id: "graphite",
    label: "Graphite",
    dark: true,
    swatches: ["#111113", "#191A1D", "#8E9098", "#E2E0DA"],
  },
  {
    id: "plum",
    label: "Plum",
    dark: true,
    swatches: ["#0C0816", "#120F22", "#8870B0", "#DCCEF8"],
  },
  // ── Light ─────────────────────────────────────────────────────────
  {
    id: "parchment",
    label: "Parchment",
    dark: false,
    swatches: ["#F5F0E8", "#FDFAF4", "#A09080", "#28200F"],
  },
  {
    id: "sky",
    label: "Sky",
    dark: false,
    swatches: ["#EBF3FF", "#FFFFFF", "#6888AA", "#122038"],
  },
  {
    id: "sage",
    label: "Sage",
    dark: false,
    swatches: ["#EDF5ED", "#F8FCF8", "#688A68", "#122012"],
  },
  {
    id: "rose",
    label: "Rose",
    dark: false,
    swatches: ["#FDF0F4", "#FFFBFD", "#B07090", "#280E18"],
  },
];

export const DEFAULT_THEME: ThemeId = "obsidian";

export function applyTheme(id: ThemeId) {
  document.documentElement.setAttribute("data-theme", id);
}

export function getSavedTheme(): ThemeId {
  try {
    const saved = localStorage.getItem("study_ai_theme") as ThemeId | null;
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {}
  return DEFAULT_THEME;
}

export function saveTheme(id: ThemeId) {
  try { localStorage.setItem("study_ai_theme", id); } catch {}
  applyTheme(id);
}
