import { ArrowLeft, Palette, ChevronRight } from "lucide-react";

interface Props {
  onBack: () => void;
  onSelectThemeSettings: () => void;
}

export function SettingsPage({ onBack, onSelectThemeSettings }: Props) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b border-border bg-surface dms-page-px py-5 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="mr-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted hover:bg-surface-hover hover:text-fg transition cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <h2 className="text-xl font-semibold text-fg">Settings</h2>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Manage your application configuration and preferences.
          </p>
        </div>
      </header>

      <div className="dms-page-bg flex-1 overflow-y-auto dms-page-px dms-page-py">
        <div className="mx-auto max-w-3xl">
          <div className="dms-card border border-border bg-surface p-6 shadow-xl rounded-2xl">
            <h3 className="mb-4 text-sm font-semibold text-fg uppercase tracking-wider">
              System Preferences
            </h3>
            
            <div className="divide-y divide-border">
              {/* Theme Settings Option */}
              <button
                onClick={onSelectThemeSettings}
                className="w-full py-4 flex items-center justify-between text-left hover:bg-surface-hover/30 rounded-xl px-3 -mx-3 transition group cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-fg transition-all duration-200">
                    <Palette className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">
                      Theme Settings
                    </span>
                    <span className="block text-xs text-muted mt-0.5">
                      Customize color themes, switch between Dark/Light modes, and preview visual palettes.
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted group-hover:text-fg group-hover:translate-x-0.5 transition-all duration-200" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
