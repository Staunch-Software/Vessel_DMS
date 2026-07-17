import { useState } from "react";
import { LayoutDashboard, Layers, Plus, User, LogOut, ShieldOff, Archive, Trash2 } from "lucide-react";
import type { FolderNode } from "../api";
import { MAIN_ACCENTS } from "./nodeStyle";

interface Props {
  mains: FolderNode[];
  view: "dashboard" | "explorer" | "profile" | "archive" | "recycle_bin";
  selectedMainId: string | null;
  userDisplayName?: string;
  userPhotoBase64?: string | null;
  onSelectMain: (node: FolderNode) => void;
  onDashboard: () => void;
  onNewVessel: () => void;
  onSignOut: () => void;
  onGlobalSignOut: () => void;
  onProfile: () => void;
  onViewFullPhoto?: () => void;
  onArchive: () => void;
  onRecycleBin: () => void;
}

export function Sidebar({
  mains,
  view,
  selectedMainId,
  userDisplayName,
  userPhotoBase64,
  onSelectMain,
  onDashboard,
  onNewVessel,
  onSignOut,
  onGlobalSignOut,
  onProfile,
  onViewFullPhoto,
  onArchive,
  onRecycleBin,
}: Props) {
  const [showSignOutPopup, setShowSignOutPopup] = useState(false);

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

      {/* Bottom: Profile + Sign-out section */}
      <div className="border-t border-white/10 px-3 py-3 space-y-1">
        {/* Archive button */}
        <button
          onClick={onArchive}
          className={
            "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition " +
            (view === "archive"
              ? "bg-white/10 font-medium text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white")
          }
          title="View Archived Folders"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <Archive className="h-4 w-4 text-amber-400" />
          </span>
          <span className="truncate min-w-0 flex-1 text-left">
            Archive
          </span>
        </button>

        {/* Recycle Bin button */}
        <button
          onClick={onRecycleBin}
          className={
            "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition " +
            (view === "recycle_bin"
              ? "bg-white/10 font-medium text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white")
          }
          title="View Recycle Bin"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <Trash2 className="h-4 w-4 text-rose-400" />
          </span>
          <span className="truncate min-w-0 flex-1 text-left">
            Recycle Bin
          </span>
        </button>


        {/* Profile button */}
        <button
          onClick={onProfile}
          className={
            "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition " +
            (view === "profile"
              ? "bg-white/10 font-medium text-white"
              : "text-slate-300 hover:bg-white/5 hover:text-white")
          }
          title="View Profile"
        >
          <span 
            onClick={(e) => {
              if (userPhotoBase64 && onViewFullPhoto) {
                e.stopPropagation();
                onViewFullPhoto();
              }
            }}
            className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold overflow-hidden " + (userPhotoBase64 ? "cursor-pointer hover:opacity-85 transition rounded-full" : "bg-white/10 text-brand-300")}
            title={userPhotoBase64 ? "Click to view full photo" : undefined}
          >
            {userPhotoBase64 ? (
              <img src={userPhotoBase64} alt="Profile" className="h-full w-full object-cover" />
            ) : userDisplayName ? (
              userDisplayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
            ) : (
              <User className="h-4 w-4" />
            )}
          </span>
          <span className="truncate min-w-0 flex-1 text-left">
            {userDisplayName || "Profile"}
          </span>
        </button>

        {/* Sign-out button */}
        <button
          onClick={() => setShowSignOutPopup(true)}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10">
            <LogOut className="h-4 w-4 text-brand-300" />
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

          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-navy-950 p-6 shadow-2xl animate-scale-up text-slate-200">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                <LogOut className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Sign Out</h3>
                <p className="text-xs text-slate-400">Choose your sign out method</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowSignOutPopup(false);
                  onSignOut();
                }}
                className="group flex w-full items-center justify-between rounded-xl bg-white/5 p-4 text-left border border-white/5 transition hover:bg-white/10 hover:border-brand-500/30 cursor-pointer"
              >
                <div className="pr-4">
                  <div className="text-sm font-semibold text-white group-hover:text-brand-300 transition">
                    Sign Out (Current Account)
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Sign out of your active session on this device.
                  </div>
                </div>
                <LogOut className="h-5 w-5 text-slate-400 group-hover:text-brand-400 transition shrink-0" />
              </button>

              <button
                onClick={() => {
                  setShowSignOutPopup(false);
                  onGlobalSignOut();
                }}
                className="group flex w-full items-center justify-between rounded-xl bg-rose-500/5 p-4 text-left border border-rose-500/5 transition hover:bg-rose-500/10 hover:border-rose-500/30 cursor-pointer"
              >
                <div className="pr-4">
                  <div className="text-sm font-semibold text-rose-300 group-hover:text-rose-200 transition">
                    Sign Out All Accounts
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Completely sign out of all Microsoft SSO accounts on this device.
                  </div>
                </div>
                <ShieldOff className="h-5 w-5 text-slate-500 group-hover:text-rose-400 transition shrink-0" />
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowSignOutPopup(false)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm font-medium text-slate-300 hover:bg-white/10 transition cursor-pointer"
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
