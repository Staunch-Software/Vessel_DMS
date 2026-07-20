import { ensureReadablePair, hexToHsl, hslToHex, shade } from "./color";
import type { ThemeTokens } from "./tokens";

export type ThemeMode = "light" | "dark";

/**
 * Everything a new color theme needs to define. Every other token (borders,
 * surfaces, hover states, sidebar, hover/active states, hover, focus rings,
 * ...) is *derived* from these few seed colors by `buildThemeTokens` below —
 * this is what makes adding theme #21 a one-object change (see ThemeSeed
 * usages at the bottom of this file) instead of hand-picking ~40 hex values
 * per mode.
 */
export interface ThemeSeed {
  id: string;
  name: string;
  /** Primary brand hue — buttons, links, active states, focus ring. */
  primary: string;
  /** Secondary hue. Defaults to primary shifted +28° if omitted. */
  secondary?: string;
  /** Accent hue for highlights/badges. Defaults to primary shifted -36°. */
  accent?: string;
  /** Optional fine-grained token overrides per mode for special themes. */
  overrides?: Partial<Record<ThemeMode, Partial<ThemeTokens>>>;
}

// Fixed, theme-independent semantic colors. Status colors deliberately do
// NOT vary per color theme — a user learns "red = error" once and it must
// stay true no matter which of the 20 palettes is active. Only light/dark
// mode adjusts them (dark mode needs a lighter, more saturated variant to
// stay legible against a near-black surface).
const SEMANTIC = {
  light: { success: "#15803d", warning: "#b45309", error: "#b91c1c", info: "#1d4ed8" },
  dark: { success: "#4ade80", warning: "#fbbf24", error: "#f87171", info: "#60a5fa" },
};

function hueShift(hex: string, degrees: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: hsl.h + degrees });
}

/** Build a color sharing `hueSource`'s hue but with an explicit lightness/saturation. */
function tint(hueSource: string, l: number, s: number): string {
  const { h } = hexToHsl(hueSource);
  return hslToHex({ h, s, l });
}

/** Build a color from a raw hue angle (used for the fixed semantic-status backgrounds). */
function fromHsl(h: number, l: number, s: number): string {
  return hslToHex({ h, s, l });
}

export function buildThemeTokens(seed: ThemeSeed, mode: ThemeMode): ThemeTokens {
  const secondary = seed.secondary ?? hueShift(seed.primary, 28);
  const accent = seed.accent ?? hueShift(seed.primary, -36);
  const hue = seed.primary;
  const isDark = mode === "dark";

  // Brand colors get a touch lighter/more saturated in dark mode so they
  // stay vivid (and pass contrast) against a near-black surface.
  const primaryRaw = isDark ? tint(hue, 62, hexToHsl(hue).s + 6) : hue;
  const secondaryRaw = isDark ? tint(secondary, 62, hexToHsl(secondary).s + 6) : secondary;
  const accentRaw = isDark ? tint(accent, 64, hexToHsl(accent).s + 8) : accent;

  // ensureReadablePair nudges lightness only as far as needed for AA contrast
  // (4.5:1) against its own foreground text — a structural guarantee rather
  // than something re-checked by hand for each of the 20 themes.
  const { bg: primary, fg: primaryFg } = ensureReadablePair(primaryRaw);
  const { bg: secondaryAdj, fg: secondaryFg } = ensureReadablePair(secondaryRaw);
  const { bg: accentAdj, fg: accentFg } = ensureReadablePair(accentRaw);
  const primaryHover = shade(primary, isDark ? 8 : -9);
  const secondaryHover = shade(secondaryAdj, isDark ? 8 : -9);
  const accentHover = shade(accentAdj, isDark ? 8 : -9);

  const sem = SEMANTIC[mode];
  const successPair = ensureReadablePair(sem.success);
  const warningPair = ensureReadablePair(sem.warning);
  const errorPair = ensureReadablePair(sem.error);
  const infoPair = ensureReadablePair(sem.info);

  const tokens: ThemeTokens = isDark
    ? {
        bg: tint(hue, 9, 18),
        surface: tint(hue, 13, 16),
        surface2: tint(hue, 17, 15),
        surfaceHover: tint(hue, 21, 15),
        border: tint(hue, 26, 15),
        borderStrong: tint(hue, 34, 15),
        fg: tint(hue, 93, 6),
        muted: tint(hue, 68, 8),
        subtle: tint(hue, 48, 8),
        inverse: "#0b1220",

        primary,
        primaryHover,
        primaryFg,
        secondary: secondaryAdj,
        secondaryHover,
        secondaryFg,
        accent: accentAdj,
        accentHover,
        accentFg,

        sidebarBg: tint(hue, 7, 38),
        sidebarFg: tint(hue, 94, 8),
        sidebarMuted: tint(hue, 62, 12),
        sidebarActive: tint(hue, 16, 32),
        sidebarHover: tint(hue, 20, 24),
        sidebarIcon: tint(hue, 22, 30),
        sidebarBorder: tint(hue, 16, 30),

        topnavBg: tint(hue, 13, 16),
        topnavFg: tint(hue, 93, 6),
        topnavBorder: tint(hue, 26, 15),

        success: successPair.bg,
        successBg: fromHsl(140, 20, 35),
        successFg: successPair.fg,
        warning: warningPair.bg,
        warningBg: fromHsl(45, 20, 40),
        warningFg: warningPair.fg,
        error: errorPair.bg,
        errorBg: fromHsl(0, 22, 40),
        errorFg: errorPair.fg,
        info: infoPair.bg,
        infoBg: fromHsl(220, 20, 35),
        infoFg: infoPair.fg,

        selection: tint(hue, 30, 55),
        focusRing: primary,
        scrollbar: tint(hue, 30, 15),
        scrollbarHover: tint(hue, 38, 15),
        statVessels: primary,
        statMainFolders: secondaryAdj,
        statDocuments: accentAdj,
        statMonthly: infoPair.bg,
      }
    : {
        bg: tint(hue, 98, 25),
        surface: "#ffffff",
        surface2: tint(hue, 96, 22),
        surfaceHover: tint(hue, 94, 20),
        border: tint(hue, 89, 18),
        borderStrong: tint(hue, 78, 16),
        fg: tint(hue, 16, 18),
        muted: tint(hue, 42, 10),
        subtle: tint(hue, 58, 8),
        inverse: "#ffffff",

        primary,
        primaryHover,
        primaryFg,
        secondary: secondaryAdj,
        secondaryHover,
        secondaryFg,
        accent: accentAdj,
        accentHover,
        accentFg,

        sidebarBg: tint(hue, 12, 42),
        sidebarFg: tint(hue, 95, 6),
        sidebarMuted: tint(hue, 66, 10),
        sidebarActive: tint(hue, 20, 34),
        sidebarHover: tint(hue, 22, 30),
        sidebarIcon: tint(hue, 24, 26),
        sidebarBorder: tint(hue, 20, 32),

        topnavBg: "#ffffff",
        topnavFg: tint(hue, 16, 18),
        topnavBorder: tint(hue, 89, 18),

        success: successPair.bg,
        successBg: fromHsl(140, 95, 45),
        successFg: successPair.fg,
        warning: warningPair.bg,
        warningBg: fromHsl(45, 95, 50),
        warningFg: warningPair.fg,
        error: errorPair.bg,
        errorBg: fromHsl(0, 96, 50),
        errorFg: errorPair.fg,
        info: infoPair.bg,
        infoBg: fromHsl(220, 96, 45),
        infoFg: infoPair.fg,

        selection: tint(hue, 88, 20),
        focusRing: primary,
        scrollbar: tint(hue, 82, 16),
        scrollbarHover: tint(hue, 72, 14),
        statVessels: primary,
        statMainFolders: secondaryAdj,
        statDocuments: accentAdj,
        statMonthly: infoPair.bg,
      };

  return {
    ...tokens,
    ...(seed.overrides?.[mode] ?? {}),
  };
}

/**
 * The 20 required color themes. To add a new one: append an object here
 * (id, name, primary, and optionally secondary/accent) — buildThemeTokens
 * derives everything else automatically for both light and dark mode.
 */
export const THEME_SEEDS: ThemeSeed[] = [
  { id: "ocean-blue", name: "Ocean Blue", primary: "#0284c7" },
  { id: "navy-blue", name: "Navy Blue", primary: "#1e3a8a", accent: "#0ea5e9" },
  { id: "emerald-green", name: "Emerald Green", primary: "#059669" },
  { id: "forest-green", name: "Forest Green", primary: "#166534", accent: "#65a30d" },
  { id: "royal-purple", name: "Royal Purple", primary: "#7c3aed" },
  { id: "indigo", name: "Indigo", primary: "#4f46e5" },
  { id: "crimson-red", name: "Crimson Red", primary: "#be123c" },
  { id: "sunset-orange", name: "Sunset Orange", primary: "#ea580c" },
  { id: "amber-gold", name: "Amber Gold", primary: "#b45309", accent: "#eab308" },
  { id: "slate-gray", name: "Slate Gray", primary: "#475569", accent: "#0ea5e9" },
  { id: "teal", name: "Teal", primary: "#0d9488" },
  { id: "cyan", name: "Cyan", primary: "#0891b2" },
  { id: "rose", name: "Rose", primary: "#e11d48" },
  { id: "pink", name: "Pink", primary: "#db2777" },
  { id: "chocolate-brown", name: "Chocolate Brown", primary: "#7c4a25", accent: "#c2703d" },
  { id: "graphite", name: "Graphite", primary: "#374151", accent: "#6366f1" },
  { id: "midnight-black", name: "Midnight Black", primary: "#18181b", accent: "#6366f1" },
  { id: "pearl-white", name: "Pearl White", primary: "#64748b", accent: "#0ea5e9" },
  { id: "steel-blue", name: "Steel Blue", primary: "#3b6f9c" },
  { id: "marine-blue", name: "Marine Blue", primary: "#155e75", accent: "#0d9488" },
  {
    id: "pastel-delight",
    name: "Pastel Delight",
    primary: "#8b5cf6",
    secondary: "#a78bfa",
    accent: "#fb7185",
    overrides: {
      light: {
        bg: "#fcfcff",
        surface: "#ffffff",
        surface2: "#f8faff",
        surfaceHover: "#f3f6ff",
        border: "#e9ebff",
        borderStrong: "#d6dcff",
        fg: "#2f2553",
        muted: "#695f91",
        subtle: "#8d85b4",
        sidebarBg: "#ede9fe",
        sidebarFg: "#322359",
        sidebarMuted: "#6f63a2",
        sidebarActive: "#d8cfff",
        sidebarHover: "#e2dbff",
        sidebarIcon: "#ddd6fe",
        topnavBg: "#ffffff",
        topnavFg: "#2f2553",
        topnavBorder: "#e9ebff",
        primary: "#8b5cf6",
        primaryHover: "#7c3aed",
        secondary: "#a78bfa",
        secondaryHover: "#8b5cf6",
        accent: "#fb7185",
        accentHover: "#f43f5e",
        statVessels: "#c4b5fd",
        statMainFolders: "#6ee7b7",
        statDocuments: "#fdba74",
        statMonthly: "#7dd3fc",
      },
    },
  },

  // ── Additional light/pastel themes (professional, enterprise-style) ──
  // Each follows the same pattern as pastel-delight: a hand-tuned
  // `overrides.light` for a soft, high-lightness sidebar/topnav/surface
  // look, with a standard auto-derived dark mode (nothing below touches
  // any existing theme or the light/dark switching mechanism above).
  {
    id: "light-blue",
    name: "Light Blue",
    primary: "#2563eb",
    secondary: "#3b82f6",
    accent: "#0ea5e9",
    overrides: {
      light: {
        bg: "#fbfcfe", surface: "#ffffff", surface2: "#f7f9fc", surfaceHover: "#f2f5fb",
        border: "#dde5f4", borderStrong: "#c4d2e9",
        fg: "#233148", muted: "#586a89", subtle: "#8594ad",
        sidebarBg: "#e2ebf8", sidebarFg: "#21314a", sidebarMuted: "#576c8e",
        sidebarActive: "#c0d3f2", sidebarHover: "#d1dff5", sidebarIcon: "#cbd9f1",
        topnavBg: "#ffffff", topnavFg: "#233148", topnavBorder: "#dde5f4",
        primary: "#2563eb", primaryHover: "#134ecf",
        secondary: "#3b82f6", secondaryHover: "#0f66f4",
        accent: "#0ea5e9", accentHover: "#0b86be",
      },
    },
  },
  {
    id: "sky-blue",
    name: "Sky Blue",
    primary: "#0ea5e9",
    secondary: "#38bdf8",
    accent: "#22d3ee",
    overrides: {
      light: {
        bg: "#fbfdfe", surface: "#ffffff", surface2: "#f7fbfd", surfaceHover: "#f1f8fb",
        border: "#dbedf5", borderStrong: "#c1deeb",
        fg: "#233c48", muted: "#587989", subtle: "#85a0ad",
        sidebarBg: "#e1f2f9", sidebarFg: "#213d4a", sidebarMuted: "#577d8e",
        sidebarActive: "#bde3f4", sidebarHover: "#cfeaf7", sidebarIcon: "#c9e6f3",
        topnavBg: "#ffffff", topnavFg: "#233c48", topnavBorder: "#dbedf5",
        primary: "#0ea5e9", primaryHover: "#0b86be",
        secondary: "#38bdf8", secondaryHover: "#0caef6",
        accent: "#22d3ee", accentHover: "#10b8d2",
      },
    },
  },
  {
    id: "ice-blue",
    name: "Ice Blue",
    primary: "#5b9bd5",
    secondary: "#7fb3e0",
    accent: "#93c5fd",
    overrides: {
      light: {
        bg: "#fcfdfd", surface: "#ffffff", surface2: "#f9fafb", surfaceHover: "#f4f7f8",
        border: "#e2eaee", borderStrong: "#cdd9df",
        fg: "#233c48", muted: "#587889", subtle: "#85a0ad",
        sidebarBg: "#e7eff4", sidebarFg: "#213c4a", sidebarMuted: "#577c8e",
        sidebarActive: "#c9dee9", sidebarHover: "#d8e7ee", sidebarIcon: "#d3e2e9",
        topnavBg: "#ffffff", topnavFg: "#233c48", topnavBorder: "#e2eaee",
        primary: "#5b9bd5", primaryHover: "#3685cc",
        secondary: "#7fb3e0", secondaryHover: "#5a9dd7",
        accent: "#93c5fd", accentHover: "#66adfc",
      },
    },
  },
  {
    id: "azure-light",
    name: "Azure Light",
    primary: "#0284c7",
    secondary: "#0ea5e9",
    accent: "#06b6d4",
    overrides: {
      light: {
        bg: "#fbfdfe", surface: "#ffffff", surface2: "#f7fafd", surfaceHover: "#f0f7fc",
        border: "#daeaf7", borderStrong: "#bfd9ee",
        fg: "#233848", muted: "#587389", subtle: "#859cad",
        sidebarBg: "#e0effa", sidebarFg: "#21384a", sidebarMuted: "#57768e",
        sidebarActive: "#bbddf7", sidebarHover: "#cee6f8", sidebarIcon: "#c7e1f5",
        topnavBg: "#ffffff", topnavFg: "#233848", topnavBorder: "#daeaf7",
        primary: "#0284c7", primaryHover: "#02669a",
        secondary: "#0ea5e9", secondaryHover: "#0b86be",
        accent: "#06b6d4", accentHover: "#0590a7",
      },
    },
  },
  {
    id: "pastel-blue",
    name: "Pastel Blue",
    primary: "#6d8fd6",
    secondary: "#8aa5e0",
    accent: "#a78bfa",
    overrides: {
      light: {
        bg: "#fbfcfe", surface: "#ffffff", surface2: "#f8f9fc", surfaceHover: "#f2f4fa",
        border: "#dee3f2", borderStrong: "#c7cfe6",
        fg: "#232d48", muted: "#586589", subtle: "#858fad",
        sidebarBg: "#e4e9f7", sidebarFg: "#212c4a", sidebarMuted: "#57668e",
        sidebarActive: "#c3ceef", sidebarHover: "#d3dcf3", sidebarIcon: "#cdd6ee",
        topnavBg: "#ffffff", topnavFg: "#232d48", topnavBorder: "#dee3f2",
        primary: "#6d8fd6", primaryHover: "#4974cc",
        secondary: "#8aa5e0", secondaryHover: "#6689d6",
        accent: "#a78bfa", accentHover: "#865ff8",
      },
    },
  },
  {
    id: "mint-green",
    name: "Mint Green",
    primary: "#10b981",
    secondary: "#34d399",
    accent: "#5eead4",
    overrides: {
      light: {
        bg: "#fbfefd", surface: "#ffffff", surface2: "#f8fcfb", surfaceHover: "#f2faf7",
        border: "#def2eb", borderStrong: "#c6e7dc",
        fg: "#23483c", muted: "#588978", subtle: "#85ada0",
        sidebarBg: "#e3f7f0", sidebarFg: "#214a3c", sidebarMuted: "#578e7c",
        sidebarActive: "#c2f0e0", sidebarHover: "#d3f3e8", sidebarIcon: "#cdefe4",
        topnavBg: "#ffffff", topnavFg: "#23483c", topnavBorder: "#def2eb",
        primary: "#10b981", primaryHover: "#0c8f64",
        secondary: "#34d399", secondaryHover: "#27b27f",
        accent: "#5eead4", accentHover: "#35e5c9",
      },
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    primary: "#8856c5",
    secondary: "#a985d4",
    accent: "#ec8fc0",
    overrides: {
      light: {
        bg: "#fdfbfe", surface: "#ffffff", surface2: "#fbf8fc", surfaceHover: "#f7f2fa",
        border: "#ebdff1", borderStrong: "#dbc8e5",
        fg: "#3c2348", muted: "#785889", subtle: "#a085ad",
        sidebarBg: "#f0e4f6", sidebarFg: "#3c214a", sidebarMuted: "#7c578e",
        sidebarActive: "#e0c3ee", sidebarHover: "#e8d4f2", sidebarIcon: "#e3ceee",
        topnavBg: "#ffffff", topnavFg: "#3c2348", topnavBorder: "#ebdff1",
        primary: "#8856c5", primaryHover: "#713db1",
        secondary: "#a985d4", secondaryHover: "#9163c8",
        accent: "#ec8fc0", accentHover: "#e568aa",
      },
    },
  },
  {
    id: "beige-sand",
    name: "Beige / Sand",
    primary: "#b08553",
    secondary: "#c49a6c",
    accent: "#d4a24c",
    overrides: {
      light: {
        bg: "#fefdfb", surface: "#ffffff", surface2: "#fcfaf8", surfaceHover: "#f9f7f3",
        border: "#f1e9e0", borderStrong: "#e3d8c9",
        fg: "#453627", muted: "#82705e", subtle: "#a7998b",
        sidebarBg: "#f6eee5", sidebarFg: "#473624", sidebarMuted: "#87735e",
        sidebarActive: "#eddbc5", sidebarHover: "#f1e5d5", sidebarIcon: "#ece0cf",
        topnavBg: "#ffffff", topnavFg: "#453627", topnavBorder: "#f1e9e0",
        primary: "#b08553", primaryHover: "#926e43",
        secondary: "#c49a6c", secondaryHover: "#b7834b",
        accent: "#d4a24c", accentHover: "#c38d2f",
      },
    },
  },
  {
    id: "soft-grey",
    name: "Soft Grey",
    primary: "#6b7280",
    secondary: "#8b93a1",
    accent: "#5b8dd6",
    overrides: {
      light: {
        bg: "#fcfcfd", surface: "#ffffff", surface2: "#fafafa", surfaceHover: "#f6f6f7",
        border: "#e7e8e9", borderStrong: "#d6d6d6",
        fg: "#2c323f", muted: "#696e77", subtle: "#95989d",
        sidebarBg: "#eaecf0", sidebarFg: "#2a3241", sidebarMuted: "#6a707c",
        sidebarActive: "#d1d6e0", sidebarHover: "#dee1e8", sidebarIcon: "#dadde2",
        topnavBg: "#ffffff", topnavFg: "#2c323f", topnavBorder: "#e7e8e9",
        primary: "#6b7280", primaryHover: "#565c67",
        secondary: "#8b93a1", secondaryHover: "#727b8c",
        accent: "#5b8dd6", accentHover: "#3673cd",
      },
    },
  },
  {
    id: "frost",
    name: "Frost",
    primary: "#4a74a2",
    secondary: "#6d97bd",
    accent: "#7dd3fc",
    overrides: {
      light: {
        bg: "#fcfcfd", surface: "#ffffff", surface2: "#f9fafb", surfaceHover: "#f5f6f7",
        border: "#e5e8eb", borderStrong: "#d2d6da",
        fg: "#293642", muted: "#63707e", subtle: "#8f99a3",
        sidebarBg: "#e9edf2", sidebarFg: "#273645", sidebarMuted: "#637383",
        sidebarActive: "#cddae4", sidebarHover: "#dbe3eb", sidebarIcon: "#d7dee5",
        topnavBg: "#ffffff", topnavFg: "#293642", topnavBorder: "#e5e8eb",
        primary: "#4a74a2", primaryHover: "#3c5d82",
        secondary: "#6d97bd", secondaryHover: "#4e80ae",
        accent: "#7dd3fc", accentHover: "#50c4fb",
      },
    },
  },
];
