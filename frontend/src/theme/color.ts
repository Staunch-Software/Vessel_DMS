/**
 * Small, dependency-free color-math toolkit used to *derive* a full theme
 * token set from a handful of seed colors (see palettes.ts). Keeping this
 * logic centralized is what lets a new theme be "one config object" instead
 * of ~20 hand-picked, easy-to-get-inconsistent hex values.
 */

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function hslToHex({ h, s, l }: HSL): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Lighten (positive amount) or darken (negative) a hex color by adjusting HSL lightness. */
export function shade(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, l: clamp(hsl.l + amount, 0, 100) });
}

/** Adjust saturation by a delta (positive = more saturated, negative = more muted). */
export function saturate(hex: string, amount: number): string {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, s: clamp(hsl.s + amount, 0, 100) });
}

/** Relative luminance per WCAG 2.x, used to pick a readable foreground color. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a) + 0.05;
  const l2 = relativeLuminance(b) + 0.05;
  return l1 > l2 ? l1 / l2 : l2 / l1;
}

/** Pick whichever of white/near-black gives better WCAG contrast against `bg`. */
export function readableForeground(bg: string): string {
  const white = "#ffffff";
  const ink = "#0b1220";
  return contrastRatio(bg, white) >= contrastRatio(bg, ink) ? white : ink;
}

/**
 * Guarantee a `{ bg, fg }` pair meets `minRatio` (WCAG AA = 4.5 for text).
 * Picks the better of white/ink for `fg`, then nudges `bg`'s lightness in
 * small steps (toward darker for a white fg, lighter for an ink fg) until
 * the pair clears the threshold. This is what makes contrast a *structural
 * guarantee* rather than something re-verified by hand per theme — any
 * seed color a future theme adds gets this automatically.
 */
export function ensureReadablePair(bg: string, minRatio = 4.5): { bg: string; fg: string } {
  let candidate = bg;
  let fg = readableForeground(candidate);
  const goingDarker = fg === "#ffffff";
  for (let i = 0; i < 40 && contrastRatio(candidate, fg) < minRatio; i++) {
    candidate = shade(candidate, goingDarker ? -3 : 3);
  }
  return { bg: candidate, fg };
}
