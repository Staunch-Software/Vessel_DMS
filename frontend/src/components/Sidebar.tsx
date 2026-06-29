import { Anchor, LayoutDashboard, Layers, Plus } from "lucide-react";
import type { FolderNode } from "../api";
import { MAIN_ACCENTS } from "./nodeStyle";

interface Props {
  mains: FolderNode[];
  view: "dashboard" | "explorer";
  selectedMainId: string | null;
  onSelectMain: (node: FolderNode) => void;
  onDashboard: () => void;
  onNewVessel: () => void;
}

export function Sidebar({
  mains,
  view,
  selectedMainId,
  onSelectMain,
  onDashboard,
  onNewVessel,
}: Props) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col bg-navy-900 text-slate-200">
      <button
        onClick={onDashboard}
        className="flex items-center gap-3 px-5 py-5 text-left transition hover:bg-white/5"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20 ring-1 ring-brand-400/30">
          <Anchor className="h-5 w-5 text-brand-300" />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight text-white">
            Vessel DMS
          </h1>
          <p className="text-[11px] text-slate-400">SharePoint Embedded</p>
        </div>
      </button>

      <div className="px-4 pb-3">
        <button
          onClick={onNewVessel}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-500"
        >
          <Plus className="h-4 w-4" />
          New Vessel
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        <button
          onClick={onDashboard}
          className={
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition " +
            (view === "dashboard"
              ? "bg-white/10 font-medium text-white"
              : "text-slate-300 hover:bg-white/5")
          }
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <LayoutDashboard className="h-4 w-4 text-brand-300" />
          </span>
          Dashboard
        </button>

        <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Main Folders
        </p>

        {mains.map((m) => {
          const accent = MAIN_ACCENTS[m.name];
          const active = view === "explorer" && selectedMainId === m.id;
          return (
            <button
              key={m.id}
              onClick={() => onSelectMain(m)}
              className={
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition " +
                (active
                  ? "bg-white/10 font-medium text-white"
                  : "text-slate-300 hover:bg-white/5")
              }
            >
              <span
                className={
                  "flex h-7 w-7 items-center justify-center rounded-lg " +
                  (accent ? accent.chip : "bg-white/10")
                }
              >
                <Layers
                  className={"h-4 w-4 " + (accent ? accent.text : "text-white")}
                />
              </span>
              <span className="truncate text-left">{m.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/5 px-5 py-3 text-[11px] text-slate-500">
        UI preview · stub data
      </div>
    </aside>
  );
}
