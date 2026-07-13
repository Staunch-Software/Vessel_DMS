import { useState } from "react";
import { ClipboardCheck, LayoutDashboard, Layers, Palette, Plus, LogOut, ShieldOff } from "lucide-react";
import type { FolderNode } from "../api";
import { MAIN_ACCENTS } from "./nodeStyle";

interface Props {
  mains: FolderNode[];
  view: "dashboard" | "explorer" | "approvals" | "settings";
  selectedMainId: string | null;
  onSelectMain: (node: FolderNode) => void;
  onDashboard: () => void;
  onNewVessel: () => void;
  onSignOut: () => void;
  onGlobalSignOut: () => void;
  isAdmin?: boolean;
  onApprovals?: () => void;
  onSettings: () => void;
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
  isAdmin = false,
  onApprovals,
  onSettings,
}: Props) {
  const [showSignOutPopup, setShowSignOutPopup] = useState(false);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col bg-sidebar-bg text-sidebar-fg">
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
          <h1 className="text-sm font-semibold leading-tight text-sidebar-fg">
            Nissen DMS
          </h1>
          <p className="text-[11px] text-sidebar-muted">SharePoint Embedded</p>
        </div>
      </button>

      <div className="px-4 pb-3">
        <button
          onClick={onNewVessel}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-fg shadow-sm transition hover:bg-primary-hover"
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
              ? "bg-white/10 font-medium text-sidebar-fg"
              : "text-sidebar-muted hover:bg-white/5")
          }
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <LayoutDashboard className="h-4 w-4 text-primary" />
          </span>
          Dashboard
        </button>

        {isAdmin && onApprovals && (
          <button
            onClick={onApprovals}
            className={
              "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition " +
              (view === "approvals"
                ? "bg-white/10 font-medium text-sidebar-fg"
                : "text-sidebar-muted hover:bg-white/5")
            }
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
              <ClipboardCheck className="h-4 w-4 text-primary" />
            </span>
            Approvals
          </button>
        )}

        <button
          onClick={onSettings}
          className={
            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition " +
            (view === "settings"
              ? "bg-white/10 font-medium text-sidebar-fg"
              : "text-sidebar-muted hover:bg-white/5")
          }
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <Palette className="h-4 w-4 text-primary" />
          </span>
          Appearance
        </button>

        <p className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
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
                  ? "bg-white/10 font-medium text-sidebar-fg"
                  : "text-sidebar-muted hover:bg-white/5")
              }
            >
              <span
                className={
                  "flex h-7 w-7 items-center justify-center rounded-lg " +
                  (accent ? accent.chip : "bg-white/10")
                }
              >
                <Layers
                  className={"h-4 w-4 " + (accent ? accent.text : "text-sidebar-fg")}
                />
              </span>
              <span className="truncate text-left">{m.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Sign-out section */}
      <div className="border-t border-white/10 px-3 py-3">
        <button
          onClick={() => setShowSignOutPopup(true)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-sidebar-muted transition hover:bg-white/5 hover:text-sidebar-fg"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <LogOut className="h-4 w-4 text-primary" />
          </span>
          Sign Out
        </button>
      </div>

      {/* Sign Out Modal Popup */}
      {showSignOutPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          {/* Click outside to close */}
          <div 
            className="absolute inset-0" 
            onClick={() => setShowSignOutPopup(false)} 
          />
          
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-sidebar-bg p-6 shadow-2xl animate-scale-up text-sidebar-fg">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-sidebar-fg">Sign Out</h3>
                <p className="text-xs text-sidebar-muted">Choose your sign out method</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowSignOutPopup(false);
                  onSignOut();
                }}
                className="group flex w-full items-center justify-between rounded-xl bg-white/5 p-4 text-left border border-white/5 transition hover:bg-white/10 hover:border-primary/30 cursor-pointer"
              >
                <div className="pr-4">
                  <div className="text-sm font-semibold text-sidebar-fg group-hover:text-primary transition">
                    Sign Out (Current Account)
                  </div>
                  <div className="text-xs text-sidebar-muted mt-1">
                    Sign out of your active session on this device.
                  </div>
                </div>
                <LogOut className="h-5 w-5 text-sidebar-muted group-hover:text-primary transition shrink-0" />
              </button>

              <button
                onClick={() => {
                  setShowSignOutPopup(false);
                  onGlobalSignOut();
                }}
                className="group flex w-full items-center justify-between rounded-xl bg-error/5 p-4 text-left border border-error/10 transition hover:bg-error/10 hover:border-error/30 cursor-pointer"
              >
                <div className="pr-4">
                  <div className="text-sm font-semibold text-error group-hover:text-error transition">
                    Sign Out All Accounts
                  </div>
                  <div className="text-xs text-sidebar-muted mt-1">
                    Completely sign out of all Microsoft SSO accounts on this device.
                  </div>
                </div>
                <ShieldOff className="h-5 w-5 text-sidebar-muted group-hover:text-error transition shrink-0" />
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowSignOutPopup(false)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-sidebar-muted hover:bg-white/10 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
