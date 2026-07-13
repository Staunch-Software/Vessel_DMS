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
      };

  return tokens;
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
];
