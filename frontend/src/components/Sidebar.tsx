import { useState } from "react";
import { LayoutDashboard, ClipboardCheck, Layers, LogOut, ShieldOff, Archive, Trash2, X, Anchor, Menu, Wrench, BriefcaseBusiness, Shield, Ship } from "lucide-react";
import type { FolderNode } from "../api";
import { MAIN_ACCENTS } from "./nodeStyle";

interface Props {
  mains: FolderNode[];
  view: "dashboard" | "explorer" | "vessels" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings" | "appearance";
  selectedMainId: string | null;
  userDisplayName?: string;
  userPhotoBase64?: string | null;
  onSelectMain: (node: FolderNode) => void;
  onDashboard: () => void;
  onVessels: () => void;
  onSignOut: () => void;
  onGlobalSignOut: () => void;
  onProfile: () => void;
  onViewFullPhoto?: () => void;
  onArchive: () => void;
  onRecycleBin: () => void;
  isAdmin?: boolean;
  onApprovals?: () => void;
  /** Whether the sidebar is open on mobile/tablet */
  mobileOpen?: boolean;
  /** Called when user taps the close button or overlay on mobile */
  onMobileClose?: () => void;
  /** Desktop collapsed state: icon-only rail */
  collapsed?: boolean;
  /** Collapse the desktop sidebar into icon-only mode */
  onCollapse?: () => void;
  /** Expand the desktop sidebar from collapsed icon-only mode */
  onExpand?: () => void;
}

export function Sidebar({
  mains,
  view,
  selectedMainId,
  userDisplayName,
  userPhotoBase64,
  onSelectMain,
  onDashboard,
  onVessels,
  onSignOut,
  onGlobalSignOut,
  onProfile,
  onViewFullPhoto,
  onArchive,
  onRecycleBin,
  isAdmin = false,
  onApprovals,
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onCollapse,
  onExpand,
}: Props) {
  const [showSignOutPopup, setShowSignOutPopup] = useState(false);

  const handleNavClick = (fn: () => void) => {
    fn();
    onMobileClose?.();
  };

  const handleCloseSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 1024) {
      onMobileClose?.();
      return;
    }
    onCollapse?.();
  };

  const mainFolderIconFor = (name: string) => {
    const n = name.trim().toLowerCase();
    if (n === "technical & crewing") return Wrench;
    if (n === "commercial & chartering") return BriefcaseBusiness;
    if (n === "insurance") return Shield;
    return Layers;
  };

  const displayMainName = (name: string) => {
    const n = name.trim().toLowerCase();
    if (n === "kaizen - knowledge bank") return "Knowledge Bank";
    return name;
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
        className={`dms-sidebar-responsive flex h-full shrink-0 flex-col bg-sidebar-bg text-sidebar-fg overflow-hidden ${collapsed ? "w-20" : "w-72"} ${
          mobileOpen ? "sidebar-open" : ""
        }`}
      >
        {/* Header controls */}
        {collapsed ? (
          <div className="flex flex-col items-center gap-2 px-2 py-3">
            <button
              onClick={() => handleNavClick(onDashboard)}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30 transition hover:bg-sidebar-hover cursor-pointer"
              title="Nissen DMS"
            >
              <Anchor className="h-5 w-5" strokeWidth={2} />
            </button>
            <button
              onClick={onExpand}
              className="hidden lg:flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg transition"
              title="Expand sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              onClick={handleCloseSidebar}
              className="flex lg:hidden h-10 w-10 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg transition"
              title="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between pr-3">
            <button
              onClick={() => handleNavClick(onDashboard)}
              className="flex flex-1 items-center gap-2.5 px-5 py-3 text-left transition hover:bg-sidebar-hover cursor-pointer"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                <Anchor className="h-4 w-4" strokeWidth={2} />
              </span>
              <div>
                <h1 className="text-[13px] font-semibold leading-tight text-sidebar-fg">
                  Nissen DMS
                </h1>
                <p className="text-[10px] text-sidebar-muted">SharePoint Embedded</p>
              </div>
            </button>
            {/* Desktop collapse button */}
            <button
              onClick={handleCloseSidebar}
              className="hidden lg:flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg transition"
              title="Collapse sidebar"
            >
              <X className="h-5 w-5" />
            </button>
            {/* Mobile close button */}
            <button
              onClick={handleCloseSidebar}
              className="flex lg:hidden h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg transition"
              title="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <nav className={`flex-1 space-y-0.5 overflow-y-hidden ${collapsed ? "px-2" : "px-3"} pb-2`}>
          <button
            onClick={() => handleNavClick(onDashboard)}
            title={collapsed ? "Dashboard" : undefined}
            className={
              `flex w-full items-center ${collapsed ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-1.5 text-sm font-medium transition cursor-pointer ` +
              (view === "dashboard"
                ? "bg-sidebar-active font-semibold text-sidebar-fg"
                : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg")
            }
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active">
              <LayoutDashboard className="h-4.5 w-4.5 text-sidebar-fg/85" />
            </span>
            {!collapsed && "Dashboard"}
          </button>

          <button
            onClick={() => handleNavClick(onVessels)}
            title={collapsed ? "Vessels" : undefined}
            className={
              `flex w-full items-center ${collapsed ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-1.5 text-sm font-medium transition cursor-pointer ` +
              (view === "vessels"
                ? "bg-sidebar-active font-semibold text-sidebar-fg"
                : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg")
            }
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active">
              <Ship className="h-4.5 w-4.5 text-sidebar-fg/85" />
            </span>
            {!collapsed && "Vessels"}
          </button>

          {isAdmin && onApprovals && (
            <button
              onClick={() => handleNavClick(onApprovals)}
              title={collapsed ? "Approvals" : undefined}
              className={
                `flex w-full items-center ${collapsed ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-1.5 text-sm font-medium transition cursor-pointer ` +
                (view === "approvals"
                  ? "bg-sidebar-active font-semibold text-sidebar-fg"
                  : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg")
              }
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active">
                <ClipboardCheck className="h-4.5 w-4.5 text-sidebar-fg/85" />
              </span>
              {!collapsed && "Approvals"}
            </button>
          )}

          {!collapsed && (
            <p className="px-2 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-fg/70">
              Main Folders
            </p>
          )}

          {mains.map((m) => {
            const accent = MAIN_ACCENTS[m.name];
            const active = view === "explorer" && selectedMainId === m.id;
            const label = displayMainName(m.name);
            return (
              <button
                key={m.id}
                onClick={() => handleNavClick(() => onSelectMain(m))}
                title={collapsed ? label : undefined}
                className={
                  `flex w-full items-center ${collapsed ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-1.5 text-sm font-medium transition cursor-pointer ` +
                  (active
                    ? "bg-sidebar-active font-semibold text-sidebar-fg"
                    : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg")
                }
              >
                <span
                  className={
                    "flex h-8 w-8 items-center justify-center rounded-lg " +
                    (accent ? accent.chip : "bg-sidebar-active")
                  }
                >
                  {(() => {
                    const MainIcon = mainFolderIconFor(m.name);
                    return <MainIcon className={"h-4.5 w-4.5 " + (accent ? accent.text : "text-sidebar-fg/80")} />;
                  })()}
                </span>
                {!collapsed && <span className="truncate text-left" title={label}>{label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom: Archive / Recycle Bin / Profile / Sign-out */}
        <div className={`border-t border-sidebar-fg/15 ${collapsed ? "px-2" : "px-3"} py-1.5 space-y-0.5`}>
          <button
            onClick={() => handleNavClick(onArchive)}
            className={
              `group flex w-full items-center ${collapsed ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-1.5 text-sm font-medium transition cursor-pointer ` +
              (view === "archive"
                ? "bg-sidebar-active font-semibold text-sidebar-fg"
                : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg")
            }
            title="View Archived Folders"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active">
              <Archive className="h-4.5 w-4.5 text-amber-400" />
            </span>
            {!collapsed && <span className="truncate min-w-0 flex-1 text-left">Archive</span>}
          </button>

          <button
            onClick={() => handleNavClick(onRecycleBin)}
            className={
              `group flex w-full items-center ${collapsed ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-1.5 text-sm font-medium transition cursor-pointer ` +
              (view === "recycle_bin"
                ? "bg-sidebar-active font-semibold text-sidebar-fg"
                : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg")
            }
            title="View Recycle Bin"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active">
              <Trash2 className="h-4.5 w-4.5 text-rose-400" />
            </span>
            {!collapsed && <span className="truncate min-w-0 flex-1 text-left">Recycle Bin</span>}
          </button>

          <button
            onClick={() => handleNavClick(onProfile)}
            className={
              `group flex w-full items-center ${collapsed ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-1.5 text-sm font-medium transition cursor-pointer ` +
              (view === "profile"
                ? "bg-sidebar-active font-semibold text-sidebar-fg"
                : "text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg")
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
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold overflow-hidden"
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
            {!collapsed && (
              <span className="truncate min-w-0 flex-1 text-left">
                {userDisplayName || "Profile"}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowSignOutPopup(true)}
            className={`flex w-full items-center ${collapsed ? "justify-center px-2" : "gap-2 px-3"} rounded-lg py-1.5 text-sm font-medium transition text-sidebar-fg hover:bg-sidebar-hover hover:text-sidebar-fg cursor-pointer`}
            title={collapsed ? "Sign Out" : undefined}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-active">
              <LogOut className="h-4.5 w-4.5 text-primary" />
            </span>
            {!collapsed && "Sign Out"}
          </button>
        </div>

        {/* Sign Out Modal Popup */}
        {showSignOutPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-fg/45 backdrop-blur-sm animate-fade-in">
            <div
              className="absolute inset-0"
              onClick={() => setShowSignOutPopup(false)}
            />
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl animate-scale-up text-fg mx-4">
              <div className="flex items-center gap-3 border-b border-border pb-4 mb-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
