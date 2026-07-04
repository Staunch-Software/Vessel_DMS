import { LayoutDashboard, Layers, Plus, LogOut, ShieldOff } from "lucide-react";
import type { FolderNode } from "../api";
import { MAIN_ACCENTS } from "./nodeStyle";

interface Props {
  mains: FolderNode[];
  view: "dashboard" | "explorer";
  selectedMainId: string | null;
  onSelectMain: (node: FolderNode) => void;
  onDashboard: () => void;
  onNewVessel: () => void;
  onSignOut: () => void;
  onGlobalSignOut: () => void;
}

export function Sidebar({
  mains,
  view,
  selectedMainId,
  onSelectMain,
  onDashboard,
  onNewVessel,
  onSignOut,
  onGlobalSignOut,
}: Props) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col bg-navy-900 text-slate-200">
      <button
        onClick={onDashboard}
        className="flex items-center gap-3 px-5 py-5 text-left transition hover:bg-white/5"
      >
        <img
          src="/nissen-logo.svg"
          alt="Nissen Kaiun logo"
          className="h-10 w-auto drop-shadow-md"
        />
        <div>
          <h1 className="text-sm font-semibold leading-tight text-white">
            Nissen DMS
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

      {/* Sign-out section */}
      <div className="border-t border-white/10 px-3 py-3 space-y-1">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <LogOut className="h-4 w-4 text-brand-300" />
          </span>
          Sign Out
        </button>
        <button
          onClick={onGlobalSignOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
            <ShieldOff className="h-4 w-4 text-slate-500" />
          </span>
          Sign Out All Accounts
        </button>
      </div>
    </aside>
  );
}
