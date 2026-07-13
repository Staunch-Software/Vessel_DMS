import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildThemeTokens, THEME_SEEDS, type ThemeMode, type ThemeSeed } from "./palettes";
import { cssVarName, TOKEN_KEYS } from "./tokens";

export type ThemeModePref = ThemeMode | "system";

const MODE_KEY = "dms-theme-mode";
const COLOR_KEY = "dms-theme-color";
const DEFAULT_THEME_ID = "ocean-blue";

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
}

function resolveMode(pref: ThemeModePref): ThemeMode {
  return pref === "system" ? (systemPrefersDark() ? "dark" : "light") : pref;
}

function readStoredMode(): ThemeModePref {
  const v = typeof window !== "undefined" ? localStorage.getItem(MODE_KEY) : null;
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function readStoredThemeId(): string {
  const v = typeof window !== "undefined" ? localStorage.getItem(COLOR_KEY) : null;
  return v && THEME_SEEDS.some((t) => t.id === v) ? v : DEFAULT_THEME_ID;
}

function applyTokensToDocument(seed: ThemeSeed, mode: ThemeMode) {
  const tokens = buildThemeTokens(seed, mode);
  const root = document.documentElement;
  for (const key of TOKEN_KEYS) {
    root.style.setProperty(cssVarName(key), tokens[key]);
  }
  root.classList.toggle("dark", mode === "dark");
  root.setAttribute("data-theme", seed.id);
  root.setAttribute("data-mode", mode);
  root.style.colorScheme = mode;
}

interface ThemeContextValue {
  modePref: ThemeModePref;
  resolvedMode: ThemeMode;
  themeId: string;
  theme: ThemeSeed;
  themes: ThemeSeed[];
  setModePref: (m: ThemeModePref) => void;
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [modePref, setModePrefState] = useState<ThemeModePref>(readStoredMode);
  const [themeId, setThemeIdState] = useState<string>(readStoredThemeId);

  const resolvedMode = useMemo(() => resolveMode(modePref), [modePref]);
  const theme = useMemo(
    () => THEME_SEEDS.find((t) => t.id === themeId) ?? THEME_SEEDS[0],
    [themeId]
  );

  // useLayoutEffect (not useEffect) so CSS variables land before the browser
  // paints — minimizes any flash of the previous theme on theme/mode change.
  useLayoutEffect(() => {
    applyTokensToDocument(theme, resolvedMode);
  }, [theme, resolvedMode]);

  // Live-follow the OS theme when the user has chosen "system".
  useLayoutEffect(() => {
    if (modePref !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTokensToDocument(theme, resolveMode("system"));
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [modePref, theme]);

  const setModePref = useCallback((m: ThemeModePref) => {
    localStorage.setItem(MODE_KEY, m);
    setModePrefState(m);
  }, []);

  const setThemeId = useCallback((id: string) => {
    localStorage.setItem(COLOR_KEY, id);
    setThemeIdState(id);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      modePref,
      resolvedMode,
      themeId,
      theme,
      themes: THEME_SEEDS,
      setModePref,
      setThemeId,
    }),
    [modePref, resolvedMode, themeId, theme, setModePref, setThemeId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/** Token set for the *currently active* theme+mode — for previews/swatches. */
export function useActiveTokens() {
  const { theme, resolvedMode } = useTheme();
  return useMemo(() => buildThemeTokens(theme, resolvedMode), [theme, resolvedMode]);
}

/** Token set for an arbitrary theme (used by the palette preview cards, which
 * show every theme's swatch regardless of which one is currently active). */
export function useTokensFor(seed: ThemeSeed, mode: ThemeMode) {
  return useMemo(() => buildThemeTokens(seed, mode), [seed, mode]);
}
