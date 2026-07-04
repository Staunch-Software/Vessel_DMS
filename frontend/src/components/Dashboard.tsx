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

interface Props {
  vessels: Vessel[];
  mains: FolderNode[];
  stats: Stats | null;
  onOpenMain: (node: FolderNode) => void;
  onNewVessel: () => void;
}

export function Dashboard({ vessels, mains, stats, onOpenMain, onNewVessel }: Props) {
  const months = stats?.months ?? 0;
  const fmt = (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : v;

  const cards: { label: string; value: number | string; Icon: LucideIcon; cls: string }[] =
    [
      { label: "Vessels", value: stats?.vessels ?? vessels.length, Icon: Ship, cls: "text-brand-600 bg-brand-50" },
      { label: "Main folders", value: stats?.main_folders ?? mains.length, Icon: Layers, cls: "text-emerald-600 bg-emerald-50" },
      { label: "Auto-month folders", value: fmt(stats?.month_driven), Icon: CalendarClock, cls: "text-violet-600 bg-violet-50" },
      { label: "Documents", value: fmt(stats?.documents), Icon: FileText, cls: "text-amber-600 bg-amber-50" },
    ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div
              className={
                "mb-3 flex h-10 w-10 items-center justify-center rounded-xl " +
                s.cls
              }
            >
              <s.Icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-semibold text-slate-800">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Auto-month banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
        <div>
          <p className="text-sm font-semibold text-violet-800">
            Automatic monthly folders
          </p>
          <p className="text-sm text-violet-700/80">
            {months} monthly folders are live. The next month's folder is created
            automatically on the 20th of the prior month, and on upload if a
            document's month isn't yet present.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fleet */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-800">Fleet</h3>
            <button
              onClick={onNewVessel}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-500"
            >
              <Plus className="h-3.5 w-3.5" />
              New Vessel
            </button>
          </div>
          {vessels.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              No vessels yet. Create one to provision its folder structure.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {vessels.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                    <Ship className="h-4 w-4 text-brand-600" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {v.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      IMO {v.imo ?? "—"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Main folders quick access */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-800">
              Main folders
            </h3>
          </div>
          <div className="space-y-2 p-4">
            {mains.map((m) => {
              const accent = MAIN_ACCENTS[m.name];
              return (
                <button
                  key={m.id}
                  onClick={() => onOpenMain(m)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-200 hover:bg-slate-50"
                >
                  <span
                    className={
                      "flex h-10 w-10 items-center justify-center rounded-xl " +
                      (accent ? accent.chip : "bg-slate-100")
                    }
                  >
                    <Layers
                      className={
                        "h-5 w-5 " + (accent ? accent.text : "text-slate-500")
                      }
                    />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">
                      {m.name}
                    </p>
                    <p className="text-xs text-slate-500">Open folder</p>
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
