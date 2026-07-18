import { useState } from "react";
import { LayoutDashboard, ClipboardCheck, Layers, Palette, Plus, LogOut, ShieldOff, Archive, Trash2, X } from "lucide-react";
import type { FolderNode } from "../api";
import { MAIN_ACCENTS } from "./nodeStyle";

interface Props {
  mains: FolderNode[];
  view: "dashboard" | "explorer" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings";
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
  isAdmin?: boolean;
  onApprovals?: () => void;
  onSettings: () => void;
  /** Whether the sidebar is open on mobile/tablet */
  mobileOpen?: boolean;
  /** Called when user taps the close button or overlay on mobile */
  onMobileClose?: () => void;
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
  isAdmin = false,
  onApprovals,
  onSettings,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const [showSignOutPopup, setShowSignOutPopup] = useState(false);

  const handleNavClick = (fn: () => void) => {
    fn();
    onMobileClose?.();
  };

  return (
    <>
      {/* ── Mobile overlay backdrop ─────────────────────────────── */}
      <div
        className={`dms-mobile-overlay ${mobileOpen ? "visible" : ""}`}
        onClick={onMobileClose}
      />

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`dms-sidebar-responsive flex h-full w-72 shrink-0 flex-col bg-navy-900 text-slate-200 overflow-hidden ${
          mobileOpen ? "sidebar-open" : ""
        }`}
      >
        {/* Logo + mobile close button */}
        <div className="flex items-center justify-between pr-3">
          <button
            onClick={() => handleNavClick(onDashboard)}
            className="flex flex-1 items-center gap-2.5 px-5 py-3 text-left transition hover:bg-white/5 cursor-pointer"
          >
            <img
              src="/nissen-logo.svg"
              alt="Nissen Kaiun logo"
              className="h-7 w-auto drop-shadow-md"
            />
            <div>
              <h1 className="text-[13px] font-semibold leading-tight text-white">
                Nissen DMS
              </h1>
              <p className="text-[10px] text-slate-400">SharePoint Embedded</p>
            </div>
          </button>
          {/* Close button — only shown on tablet/mobile via CSS */}
          <button
            onClick={onMobileClose}
            className="hidden lg:hidden flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition"
            style={{ display: "flex" }}
            title="Close sidebar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-4 pb-2">
          <button
            onClick={() => handleNavClick(onNewVessel)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-500 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            New Vessel
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-hidden px-3 pb-2">
          <button
            onClick={() => handleNavClick(onDashboard)}
            className={
              "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition cursor-pointer " +
              (view === "dashboard"
                ? "bg-white/10 font-medium text-white"
                : "text-slate-300 hover:bg-white/5")
            }
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
              <LayoutDashboard className="h-3.5 w-3.5 text-brand-300" />
            </span>
            Dashboard
          </button>

          {isAdmin && onApprovals && (
            <button
              onClick={() => handleNavClick(onApprovals)}
              className={
                "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition cursor-pointer " +
                (view === "approvals"
                  ? "bg-white/10 font-medium text-white"
                  : "text-slate-300 hover:bg-white/5")
              }
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
                <ClipboardCheck className="h-3.5 w-3.5 text-brand-300" />
              </span>
              Approvals
            </button>
          )}

          <button
            onClick={() => handleNavClick(onSettings)}
            className={
              "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition cursor-pointer " +
              (view === "settings"
                ? "bg-white/10 font-medium text-white"
                : "text-slate-300 hover:bg-white/5")
            }
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
              <Palette className="h-3.5 w-3.5 text-brand-300" />
            </span>
            Appearance
          </button>

          <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Main Folders
          </p>

          {mains.map((m) => {
            const accent = MAIN_ACCENTS[m.name];
            const active = view === "explorer" && selectedMainId === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleNavClick(() => onSelectMain(m))}
                className={
                  "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition cursor-pointer " +
                  (active
                    ? "bg-white/10 font-medium text-white"
                    : "text-slate-300 hover:bg-white/5")
                }
              >
                <span
                  className={
                    "flex h-6 w-6 items-center justify-center rounded-lg " +
                    (accent ? accent.chip : "bg-white/10")
                  }
                >
                  <Layers
                    className={"h-3.5 w-3.5 " + (accent ? accent.text : "text-white")}
                  />
                </span>
                <span className="truncate text-left">{m.name}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom: Archive / Recycle Bin / Profile / Sign-out */}
        <div className="border-t border-white/10 px-3 py-1.5 space-y-0.5">
          <button
            onClick={() => handleNavClick(onArchive)}
            className={
              "group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition cursor-pointer " +
              (view === "archive"
                ? "bg-white/10 font-medium text-white"
                : "text-slate-300 hover:bg-white/5 hover:text-white")
            }
            title="View Archived Folders"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
              <Archive className="h-3.5 w-3.5 text-amber-400" />
            </span>
            <span className="truncate min-w-0 flex-1 text-left">Archive</span>
          </button>

          <button
            onClick={() => handleNavClick(onRecycleBin)}
            className={
              "group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition cursor-pointer " +
              (view === "recycle_bin"
                ? "bg-white/10 font-medium text-white"
                : "text-slate-300 hover:bg-white/5 hover:text-white")
            }
            title="View Recycle Bin"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
              <Trash2 className="h-3.5 w-3.5 text-rose-400" />
            </span>
            <span className="truncate min-w-0 flex-1 text-left">Recycle Bin</span>
          </button>

          <button
            onClick={() => handleNavClick(onProfile)}
            className={
              "group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition cursor-pointer " +
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
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold overflow-hidden"
              title={userPhotoBase64 ? "Click to view full photo" : undefined}
            >
              {userPhotoBase64 ? (
                <img src={userPhotoBase64} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-full w-full object-cover">
                  <circle cx="50" cy="50" r="50" fill="#cbd5e1" />
                  <circle cx="50" cy="45" r="18" fill="#94a3b8" />
                  <path d="M15 88C15 70 30 65 50 65C70 65 85 70 85 88" fill="#94a3b8" />
                </svg>
              )}
            </span>
            <span className="truncate min-w-0 flex-1 text-left">
              {userDisplayName || "Profile"}
            </span>
          </button>

          <button
            onClick={() => setShowSignOutPopup(true)}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition text-slate-300 hover:bg-white/5 hover:text-white cursor-pointer"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10">
              <LogOut className="h-3.5 w-3.5 text-primary" />
            </span>
            Sign Out
          </button>
        </div>

        {/* Sign Out Modal Popup */}
        {showSignOutPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/45 backdrop-blur-sm animate-fade-in">
            <div
              className="absolute inset-0"
              onClick={() => setShowSignOutPopup(false)}
            />
            <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-navy-950 p-6 shadow-2xl animate-scale-up text-slate-200 mx-4">
              <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400">
                  <LogOut className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-fg">Sign Out</h3>
                  <p className="text-xs text-muted">Choose your sign out method</p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    setShowSignOutPopup(false);
                    onSignOut();
                  }}
                  className="dms-card-hover group flex w-full items-center justify-between rounded-xl border border-border bg-surface p-4 text-left cursor-pointer"
                >
                  <div className="pr-4">
                    <div className="text-sm font-semibold text-fg group-hover:text-primary transition">
                      Sign Out (Current Account)
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Sign out of your active session on this device.
                    </div>
                  </div>
                  <LogOut className="h-5 w-5 shrink-0 text-muted transition group-hover:text-primary" />
                </button>

                <button
                  onClick={() => {
                    setShowSignOutPopup(false);
                    onGlobalSignOut();
                  }}
                  className="group flex w-full items-center justify-between rounded-xl border border-error/20 bg-error-bg p-4 text-left transition hover:border-error/40 cursor-pointer"
                >
                  <div className="pr-4">
                    <div className="text-sm font-semibold text-error group-hover:text-error transition">
                      Sign Out All Accounts
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      Completely sign out of all Microsoft SSO accounts on this device.
                    </div>
                  </div>
                  <ShieldOff className="h-5 w-5 shrink-0 text-muted transition group-hover:text-error" />
                </button>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setShowSignOutPopup(false)}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-muted transition hover:bg-surface-hover cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
