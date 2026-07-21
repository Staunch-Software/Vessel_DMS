import { useEffect } from "react";
import {
  CalendarClock,
  FileText,
  Layers,
  Plus,
  Ship,
  type LucideIcon,
} from "lucide-react";
import type { FolderNode, Stats, Vessel } from "../api";
import { MAIN_ACCENTS } from "./nodeStyle";

const displayMainName = (name: string) => {
  const n = name.trim().toLowerCase();
  if (n === "kaizen - knowledge bank") return "Knowledge Bank";
  return name;
};

interface Props {
  vessels: Vessel[];
  mains: FolderNode[];
  stats: Stats | null;
  onOpenMain: (node: FolderNode) => void;
  onOpenVessel: (vessel: Vessel) => void;
  onNewVessel: () => void;
}

export function Dashboard({ vessels, mains, stats, onOpenMain, onOpenVessel, onNewVessel }: Props) {

  // --- ADD THIS BLOCK START ---


  useEffect(() => {
    // This just ensures the URL in the address bar is clean.
    // We don't need a "Guard" anymore because we use a Login Popup.
    window.history.replaceState({ view: 'dashboard' }, '', window.location.href);
  }, []);

  const months = stats?.months ?? 0;
  // ... rest of code
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : v;

  const cards: { label: string; value: number | string; Icon: LucideIcon; cls: string; tone: string }[] =
    [
      { label: "Vessels", value: stats?.vessels ?? vessels.length, Icon: Ship, cls: "text-stat-vessels bg-stat-vessels/20", tone: "dms-stat-vessels" },
      { label: "Main folders", value: stats?.main_folders ?? mains.length, Icon: Layers, cls: "text-stat-main-folders bg-stat-main-folders/20", tone: "dms-stat-main" },
      { label: "Auto-month folders", value: fmt(stats?.month_driven), Icon: CalendarClock, cls: "text-stat-monthly bg-stat-monthly/20", tone: "dms-stat-monthly" },
      { label: "Documents", value: fmt(stats?.documents), Icon: FileText, cls: "text-stat-documents bg-stat-documents/20", tone: "dms-stat-docs" },
    ];

  return (
    <div className="w-full space-y-6">
      {/* Stat cards — 2 cols on mobile, 4 on desktop */}
      <div className="dms-stat-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((s) => (
          <div
            key={s.label}
            className={`dms-card dms-stat-card dms-card-hover ${s.tone} p-5`}
          >
            <div
              className={
                "mb-3 flex h-10 w-10 items-center justify-center rounded-xl " +
                s.cls
              }
            >
              <s.Icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-semibold text-fg">{s.value}</p>
            <p className="text-sm text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Auto-month banner */}
      <div className="dms-info-banner flex items-start gap-3 rounded-2xl p-4">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <div>
          <p className="text-sm font-semibold text-info">
            Automatic monthly folders
          </p>
          <p className="text-sm text-info/80">
            {months} monthly folders are live. The next month's folder is created
            automatically on the 20th of the prior month, and on upload if a
            document's month isn't yet present.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Fleet */}
        <section className="dms-panel">
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded" style={{ background: "#D42B2B" }}>
                <Ship className="h-4 w-4" style={{ color: "white" }} />
              </div>
              <h3 className="text-sm font-semibold text-fg">Fleet</h3>
            </div>
            <button
              onClick={onNewVessel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition cursor-pointer"
              style={{ background: "#1a1a4e", color: "white" }}
            >
              <Plus className="h-3.5 w-3.5" />
              New Vessel
            </button>
          </div>
          {vessels.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">
              No vessels yet. Create one to provision its folder structure.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {vessels.map((v) => (
                <li key={v.id}>
                  <button
                    onClick={() => onOpenVessel(v)}
                    className="group flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-surface-hover/40 cursor-pointer"
                    title={`Open ${v.name}`}
                  >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "#1a1a4e" }}
                  >
                    <Ship className="h-4 w-4" style={{ color: "#D42B2B" }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold group-hover:underline" style={{ color: "#1a1a4e" }}>
                      {v.name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      IMO {v.imo ?? "—"}
                      {v.hull_number ? ` · Hull ${v.hull_number}` : ""}
                      {v.shipyard ? ` · ${v.shipyard}` : ""}
                    </p>
                  </div>
                  {v.vessel_type && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide"
                      style={{ background: "#D42B2B", color: "white" }}
                    >
                      {v.vessel_type}
                    </span>
                  )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Main folders quick access */}
        <section className="dms-panel">
          <div className="border-b border-border px-5 py-3.5">
            <h3 className="text-sm font-semibold text-fg">
              Main folders
            </h3>
          </div>
          <div className="space-y-2 p-4">
            {mains.map((m) => {
              const accent = MAIN_ACCENTS[m.name];
              const label = displayMainName(m.name);
              return (
                <button
                  key={m.id}
                  onClick={() => onOpenMain(m)}
                  className="dms-list-box dms-card-hover group flex w-full items-center gap-3 p-3 text-left transition"
                >
                  <span
                    className={
                      "flex h-10 w-10 items-center justify-center rounded-xl " +
                      (accent ? accent.chip : "bg-surface2")
                    }
                  >
                    <Layers
                      className={
                        "h-5 w-5 " + (accent ? accent.text : "text-muted")
                      }
                    />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-fg">
                      {label}
                    </p>
                    <p className="text-xs text-muted">Open folder</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
