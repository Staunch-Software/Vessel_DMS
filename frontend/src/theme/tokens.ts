/**
 * Canonical list of theme tokens. This is the SINGLE source of truth: the
 * TypeScript type, the CSS custom properties written to the document root,
 * and the Tailwind `@theme` mapping (index.css) are all derived from these
 * names. Add a token here once and it's usable everywhere as `--dms-<name>`
 * and as a Tailwind color (`bg-<name>`, `text-<name>`, `border-<name>`, ...).
 */
export const TOKEN_KEYS = [
  // Backgrounds & surfaces
  "bg",
  "surface",
  "surface2",
  "surfaceHover",
  // Borders
  "border",
  "borderStrong",
  // Text
  "fg",
  "muted",
  "subtle",
  "inverse",
  // Brand
  "primary",
  "primaryHover",
  "primaryFg",
  "secondary",
  "secondaryHover",
  "secondaryFg",
  "accent",
  "accentHover",
  "accentFg",
  // Sidebar
  "sidebarBg",
  "sidebarFg",
  "sidebarMuted",
  "sidebarActive",
  "sidebarBorder",
  // Top navigation
  "topnavBg",
  "topnavFg",
  "topnavBorder",
  // Status
  "success",
  "successBg",
  "successFg",
  "warning",
  "warningBg",
  "warningFg",
  "error",
  "errorBg",
  "errorFg",
  "info",
  "infoBg",
  "infoFg",
  // Interaction
  "selection",
  "focusRing",
  "scrollbar",
  "scrollbarHover",
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];
export type ThemeTokens = Record<TokenKey, string>;

/** "primaryHover" -> "--dms-primary-hover" */
export function cssVarName(key: TokenKey): string {
  return `--dms-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}
