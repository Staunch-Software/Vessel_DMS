import { memo, useMemo } from "react";
import { Check, Monitor, Moon, Sun, ArrowLeft } from "lucide-react";
import { useTheme, useTokensFor, type ThemeModePref } from "../theme/ThemeProvider";
import type { ThemeMode, ThemeSeed } from "../theme/palettes";

const MODE_OPTIONS: { key: ThemeModePref; label: string; icon: typeof Sun; hint: string }[] = [
  { key: "light", label: "Light", icon: Sun, hint: "Always use the light appearance" },
  { key: "dark", label: "Dark", icon: Moon, hint: "Always use the dark appearance" },
  { key: "system", label: "System", icon: Monitor, hint: "Match your OS setting" },
];

interface ThemeSettingsProps {
  onBack?: () => void;
}

export function ThemeSettings({ onBack }: ThemeSettingsProps) {
  const { modePref, resolvedMode, themeId, themes, setModePref, setThemeId } = useTheme();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b border-border bg-surface dms-page-px py-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="mr-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-surface-hover hover:text-fg transition cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
            <h2 className="text-xl font-semibold text-fg">Appearance</h2>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Choose how Vessel DMS looks. Changes apply instantly and are remembered on this device.
          </p>
        </div>
      </header>

      <div className="dms-page-bg flex-1 overflow-y-auto dms-page-px dms-page-py">
        <div className="w-full space-y-8">
          {/* ---------------------------------------------------------- Mode */}
          <section>
            <h3 className="mb-3 text-sm font-semibold text-fg">Theme mode</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-3">
              {MODE_OPTIONS.map((opt) => {
                const active = modePref === opt.key;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setModePref(opt.key)}
                    className={
                      "group relative flex items-center gap-3 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md " +
                      (active
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-surface hover:border-primary/40")
                    }
                  >
                    <span
                      className={
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition " +
                        (active ? "bg-primary text-primary-fg" : "bg-surface2 text-muted")
                      }
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-fg">{opt.label}</span>
                      <span className="block truncate text-xs text-muted">{opt.hint}</span>
                    </span>
                    {active && (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ------------------------------------------------------ Palette */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-fg">Color palette</h3>
              <p className="text-xs text-muted">
                Previewing in {resolvedMode === "dark" ? "dark" : "light"} mode
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {themes.map((seed) => (
                <ThemeCard
                  key={seed.id}
                  seed={seed}
                  mode={resolvedMode}
                  active={seed.id === themeId}
                  onSelect={() => setThemeId(seed.id)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const ThemeCard = memo(function ThemeCard({
  seed,
  mode,
  active,
  onSelect,
}: {
  seed: ThemeSeed;
  mode: ThemeMode;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTokensFor(seed, mode);
  // Inline style (not Tailwind classes) is correct here: this card previews
  // a theme that is NOT necessarily the active one, so it can't rely on the
  // live --dms-* variables on <html> — each card renders its own candidate
  // token set from buildThemeTokens.
  const cardStyle = useMemo(
    () => ({ background: t.surface, borderColor: active ? t.primary : t.border }),
    [t, active]
  );

  return (
    <button
      onClick={onSelect}
      style={cardStyle}
      className={
        "group relative flex flex-col overflow-hidden rounded-2xl border-2 p-0 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg " +
        (active ? "ring-2 ring-primary ring-offset-2 ring-offset-bg" : "")
      }
    >
      {/* Mini app preview */}
      <div className="flex h-24 w-full" style={{ background: t.bg }}>
        <div className="flex w-8 flex-col items-center gap-1.5 py-2.5" style={{ background: t.sidebarBg }}>
          <span className="h-2 w-2 rounded-full" style={{ background: t.primary }} />
          <span className="h-1.5 w-4 rounded-full opacity-70" style={{ background: t.sidebarMuted }} />
          <span className="h-1.5 w-4 rounded-full opacity-50" style={{ background: t.sidebarMuted }} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-2.5">
          <div
            className="h-2 w-2/3 rounded"
            style={{ background: t.topnavBg, border: `1px solid ${t.border}` }}
          />
          <div className="flex flex-1 gap-1.5">
            <div className="flex-1 rounded-lg" style={{ background: t.surface, border: `1px solid ${t.border}` }} />
            <div className="flex-1 rounded-lg" style={{ background: t.surface, border: `1px solid ${t.border}` }} />
          </div>
          <div className="flex gap-1">
            <span className="h-2 w-6 rounded" style={{ background: t.primary }} />
            <span className="h-2 w-4 rounded" style={{ background: t.accent }} />
            <span className="h-2 w-4 rounded" style={{ background: t.success }} />
          </div>
        </div>
      </div>

      {/* Label row */}
      <div className="flex items-center justify-between px-3.5 py-3" style={{ borderTop: `1px solid ${t.border}` }}>
        <span className="text-sm font-semibold" style={{ color: t.fg }}>
          {seed.name}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.primary }} />
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.secondary }} />
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: t.accent }} />
        </span>
      </div>

      {active && (
        <span
          className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full shadow"
          style={{ background: t.primary, color: t.primaryFg }}
        >
          <Check className="h-4 w-4" />
        </span>
      )}
    </button>
  );
});
