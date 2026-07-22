import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronDown, ChevronUp, Menu, MoreVertical, Download, RotateCcw, FolderOpen, FolderPlus, Trash2, X, Archive, ArchiveRestore, Eye, FileText, ShieldOff, Plus, Ship, Clock3, Anchor } from "lucide-react";
import { ApprovalResultPopup, type ApprovalResultItem } from "./components/ApprovalResultPopup";
import { DuplicateFilePopup, type DuplicateFileInfo } from "./components/DuplicateFilePopup";
import { listMyApprovals, listApprovals } from "./api";
import { NotificationBell, type NotificationItem } from "./components/NotificationBell";

import {
  createVessel,
  createSubfolder,
  deleteFile,
  getChildren,
  getFolder,
  getJob,
  getMains,
  getStats,
  getProfile,
  getArchivedIds,
  getArchivedNodes,
  archiveItem,
  restoreItem,
  listVessels,
  logActivity,
  monthUpload,
  setApiEmail,
  setSessionId,
  clearSessionId,
  uploadFile,
  fileContentUrl,
  deleteFolder,
  getDeletedNodes,
  restoreDeletedItem,
  permanentDeleteItem,
  search,
  updateVessel,
  revokeSession,
  type FolderNode,
  type SearchResult,
  type Stats,
  type Vessel,
} from "./api";
import { useMsal } from "@azure/msal-react";
import { LoginPage, RETURNING_USER_STORAGE_KEY } from "./components/Login";

const cleanFolderName = (name: string): string => {
  if (!name) return "";
  let cleaned = name.replace(/_/g, " ").replace(/-/g, " ");
  cleaned = cleaned.replace(/[^a-zA-Z0-9 ]/g, "");
  cleaned = cleaned.trim().replace(/\s+/g, " ");

  const months = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
    "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec"
  ];

  months.forEach(month => {
    const regex = new RegExp(`\\b${month}\\b`, "gi");
    cleaned = cleaned.replace(regex, (m) => m.toUpperCase());
  });

  return cleaned;
};
import { Sidebar } from "./components/Sidebar";
import { CreateVesselModal } from "./components/CreateVesselModal";
import { UpdateVesselModal } from "./components/UpdateVesselModal";
import { Breadcrumb, type Crumb } from "./components/Breadcrumb";
import { UploadControl } from "./components/UploadControl";
import { ToastStack, type ToastItem } from "./components/Toast";
import { Dashboard } from "./components/Dashboard";
import { SearchBar } from "./components/SearchBar";
import { PreviewDrawer } from "./components/PreviewDrawer";
import { FolderGridSkeleton } from "./components/Skeleton";
import {
  FolderToolbar,
  type SortKey,
  type TypeKey,
  type ViewKey,
} from "./components/FolderToolbar";
import { MAIN_ACCENTS, iconFor } from "./components/nodeStyle";
import ProfilePage from "./components/Profile";
import AuthCallback from "./AuthCallback";
import { fileMeta, formatDate, formatSize } from "./components/fileType";
import { ThemeSettings } from "./components/ThemeSettings";
import { SettingsPage } from "./components/SettingsPage";
import { Approvals } from "./components/Approvals";
import { VesselListView } from "./components/VesselListView";
import { captureDiagnostics } from "./historyProbe";


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ADMIN_EMAILS: string[] = (
  (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ||
  "spe.admin@sg-nissenkaiun.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const IMG = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"];

function hasMsalAuthResponseInUrl(): boolean {
  const search = window.location.search.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const combined = `${search}&${hash}`;
  return (
    combined.includes("code=") ||
    combined.includes("id_token=") ||
    combined.includes("error=") ||
    combined.includes("state=")
  );
}

function errDetail(e: unknown, fallback: string): string {
  const raw = (e as any)?.response?.data?.detail;
  if (!raw) return fallback;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw.message) return raw.message;
  return JSON.stringify(raw);
}

function formatUploadSuccessDetail(dest: string): string {
  if (!dest) return "";
  const parts = dest.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const mainFolder = parts[0];
    const vesselName = parts[1];
    const leafFolder = parts[parts.length - 2];
    return `file successfully uploaded in '${leafFolder}' under main folder '${mainFolder}' and vessel '${vesselName}'`;
  }
  if (parts.length >= 2) {
    const mainFolder = parts[0];
    const leafFolder = parts[parts.length - 2];
    return `file successfully uploaded in '${leafFolder}' under main folder '${mainFolder}'`;
  }
  return `file successfully uploaded: ${dest}`;
}

function matchesType(n: FolderNode, key: TypeKey): boolean {
  if (key === "all") return true;
  if (key === "folders") return n.kind !== "file";
  if (n.kind !== "file") return false;
  const e = (n.ext ?? "").toLowerCase();
  if (key === "pdf") return e === "pdf";
  if (key === "images") return IMG.includes(e);
  if (key === "docs") return e === "doc" || e === "docx";
  if (key === "sheets") return ["xls", "xlsx", "csv"].includes(e);
  return true;
}

function parseMonthFolderDate(name: string): Date | null {
  if (!name) return null;
  const t = name.toLowerCase();
  const monthShort = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  
  // Find a month name
  const monthRegex = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i;
  const mMatch = monthRegex.exec(t);
  
  // Find a year (a 4-digit number starting with 20)
  const yearRegex = /(20\d{2})/;
  const yMatch = yearRegex.exec(t);
  
  if (mMatch && yMatch) {
    const monthStr = mMatch[1].toLowerCase().slice(0, 3);
    const monthIdx = monthShort.indexOf(monthStr);
    const year = parseInt(yMatch[1], 10);
    if (monthIdx !== -1) {
      return new Date(year, monthIdx, 1);
    }
  }

  // Fallback to numeric MM-YYYY date match
  const numericRegex = /\b(0[1-9]|1[0-2])[-/.](20\d{2})\b/;
  const numMatch = numericRegex.exec(t);
  if (numMatch) {
    const monthVal = parseInt(numMatch[1], 10);
    const year = parseInt(numMatch[2], 10);
    return new Date(year, monthVal - 1, 1);
  }

  const numericRegex2 = /\b(20\d{2})[-/.](0[1-9]|1[0-2])\b/;
  const numMatch2 = numericRegex2.exec(t);
  if (numMatch2) {
    const year = parseInt(numMatch2[1], 10);
    const monthVal = parseInt(numMatch2[2], 10);
    return new Date(year, monthVal - 1, 1);
  }

  return null;
}

function sortItems(
  items: FolderNode[],
  sort: SortKey,
  vessels?: Array<{ id: string; name: string }>
): FolderNode[] {
  const folders = items.filter((i) => i.kind !== "file");
  const files = items.filter((i) => i.kind === "file");

  // Build a map of vessel name -> rank for newest-first ordering.
  // vessels array is ordered oldest-first from the backend, so reverse index = newest = lower rank.
  const vesselRank = new Map<string, number>();
  if (vessels) {
    vessels.forEach((v, idx) => {
      // Lower rank = newer (reversed index)
      vesselRank.set(v.name.toLowerCase(), vessels.length - 1 - idx);
    });
  }

  // Sort Folders
  if (sort === "name") {
    folders.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "size") {
    folders.sort((a, b) => {
      const sizeDiff = (b.size ?? 0) - (a.size ?? 0);
      if (sizeDiff !== 0) return sizeDiff;
      return a.name.localeCompare(b.name);
    });
  } else if (sort === "newest") {
    folders.sort((a, b) => {
      // Month-named folders (e.g. "June 2026") sort by date
      const dateA = parseMonthFolderDate(a.name);
      const dateB = parseMonthFolderDate(b.name);
      if (dateA && dateB) return dateB.getTime() - dateA.getTime();
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;

      // Ship/vessel folders: sort by creation order using the vessels list
      if (a.kind === "ship" || b.kind === "ship") {
        const rankA = vesselRank.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        const rankB = vesselRank.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
      }

      // Non-ship folders: sort by modified date if available, else alphabetically
      const modA = a.modified ?? "";
      const modB = b.modified ?? "";
      if (modA && modB) return modB.localeCompare(modA);
      return a.name.localeCompare(b.name);
    });
  }

  // Sort Files
  const byName = (a: FolderNode, b: FolderNode) => a.name.localeCompare(b.name);
  if (sort === "name") {
    files.sort(byName);
  } else if (sort === "size") {
    files.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  } else if (sort === "newest") {
    files.sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""));
  }

  return [...folders, ...files];
}

interface PathEntry {
  id: string;
  name: string;
}

export default function App() {
  const [mains, setMains] = useState<FolderNode[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [user, setUser] = useState<{ display_name: string; email: string } | null>(null);
  // Guards the redirect-handler and auto-authenticate effects below from both
  // calling /api/auth/login for the same sign-in — without this, MSAL's
  // `accounts` array can populate while the redirect effect's own fetch is
  // still in flight, letting the auto-authenticate effect race in and create
  // a second backend session for one actual login.
  const authRequestRef = useRef<"idle" | "pending" | "done">("idle");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { instance, accounts, inProgress } = useMsal();
  const [stats, setStats] = useState<Stats | null>(null);
  const [view, setView] = useState<"dashboard" | "explorer" | "vessels" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings" | "appearance">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      if (v === "explorer" || v === "profile" || v === "dashboard" || v === "vessels" || v === "archive" || v === "recycle_bin" || v === "approvals" || v === "settings" || v === "appearance") {
        return v as "dashboard" | "explorer" | "vessels" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings" | "appearance";
      }
    }
    return "dashboard";
  });

  const [path, setPath] = useState<PathEntry[]>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("path");
      if (p) {
        try {
          return JSON.parse(p);
        } catch {
          return [];
        }
      }
    }
    return [];
  });
  const [current, setCurrent] = useState<FolderNode | null>(null);
  const [children, setChildren] = useState<FolderNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  // Cache: folderId -> children, so navigating back is instant
  const childrenCacheRef = useRef<Map<string, FolderNode[]>>(new Map());
  // Cache: folderId -> FolderNode, populated from parent's children list
  const nodesCacheRef = useRef<Map<string, FolderNode>>(new Map());
  const [showModal, setShowModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [vesselToUpdate, setVesselToUpdate] = useState<import("./api").Vessel | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpiredReason, setSessionExpiredReason] = useState<"inactivity" | "token_expiry" | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createFolderName, setCreateFolderName] = useState("");
  const [createFolderLoading, setCreateFolderLoading] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const [archivedFolderIds, setArchivedFolderIds] = useState<Set<string>>(new Set());
  const [archivedNodes, setArchivedNodes] = useState<FolderNode[]>([]);
  const [activeMenuFolderId, setActiveMenuFolderId] = useState<string | null>(null);
  const [archiveMenuDropPos, setArchiveMenuDropPos] = useState({ top: 0, bottom: 0, right: 0, flipped: false });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showArchiveSelectModal, setShowArchiveSelectModal] = useState(false);
  const [showArchivePanel, setShowArchivePanel] = useState(false);
  const [restoreConfirmNode, setRestoreConfirmNode] = useState<FolderNode | null>(null);
  const [deleteFolderIds, setDeleteFolderIds] = useState<Set<string>>(new Set());
  const [archiveSelectIds, setArchiveSelectIds] = useState<Set<string>>(new Set());
  const [_selectedVessel, _setSelectedVessel] = useState<string | null>(null);
  const [deleteFileNode, setDeleteFileNode] = useState<FolderNode | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [showArchiveReasonModal, setShowArchiveReasonModal] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [preview, setPreview] = useState<FolderNode | null>(null);
  const [showDeleteFilesModal, setShowDeleteFilesModal] = useState(false);
  const [deleteFileIds, setDeleteFileIds] = useState<Set<string>>(new Set());
  const [deletedNodes, setDeletedNodes] = useState<FolderNode[]>([]);
  const [showRecycleSelectModal, setShowRecycleSelectModal] = useState(false);
  const [recycleSelectIds, setRecycleSelectIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteRecycleModal, setShowBulkDeleteRecycleModal] = useState(false);
  const [selectedVesselByPage, setSelectedVesselByPage] = useState<Record<string, string | null>>({});
  const [searchQueryByPage, setSearchQueryByPage] = useState<Record<string, string>>({});
  const [pendingApprovalRequests, setPendingApprovalRequests] = useState<ApprovalResultItem[]>([]);
  const [duplicateFileInfo, setDuplicateFileInfo] = useState<DuplicateFileInfo | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [selectedApprovalTab, setSelectedApprovalTab] = useState<"pending" | "approved" | "rejected" | "all" | undefined>(undefined);
  const [showUploadSuccessModal, setShowUploadSuccessModal] = useState(false);


  // In-folder toolbar state
  const [fQuery, setFQuery] = useState("");
  const [typeKey, setTypeKey] = useState<TypeKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [layout, setLayout] = useState<ViewKey>("grid");
  const [listViewMode, setListViewMode] = useState(false);

  useEffect(() => {
    if (user) {
      const readKey = `read_notifications_${user.email}`;
      const readIds = JSON.parse(localStorage.getItem(readKey) || "[]") as string[];
      setReadNotificationIds(readIds);
    } else {
      setReadNotificationIds([]);
    }
  }, [user]);

  const handleMarkAllNotificationsRead = useCallback(() => {
    if (!user) return;
    const readKey = `read_notifications_${user.email}`;
    const readIds = JSON.parse(localStorage.getItem(readKey) || "[]") as string[];
    const currentIds = notifications.map((n) => n.id);
    const updatedIds = Array.from(new Set([...readIds, ...currentIds]));
    localStorage.setItem(readKey, JSON.stringify(updatedIds));
    setReadNotificationIds(updatedIds);
  }, [user, notifications]);

  const handleNotificationClick = useCallback((item: NotificationItem) => {
    setSelectedApprovalId(item.id);
    setSelectedApprovalTab(item.status);
    setView("approvals");
  }, []);

  const loadTop = useCallback(async () => {
    const [m, v, s, archIds] = await Promise.all([
      getMains(),
      listVessels(),
      getStats(),
      getArchivedIds(),
    ]);
    setMains(m);
    setVessels(v);
    setStats(s);
    setArchivedFolderIds(new Set(archIds));
    // Load archived nodes and deleted nodes lazily in the background
    getArchivedNodes().then(setArchivedNodes).catch(console.error);
    getDeletedNodes().then(setDeletedNodes).catch(console.error);
  }, []);


  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      // Only force a reload for bfcache restores when NOT already on the homepage.
      // Reloading on /homepage would interfere with our history management.
      if (event.persisted && !window.location.pathname.startsWith("/homepage")) {
        window.location.reload();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // TEMPORARY diagnostics — see src/historyProbe.ts. Captures state on every
  // fresh mount of this app (covers: first visit, the post-Microsoft-redirect
  // landing, and any case where the Back button returns to a full reload of
  // our own origin) plus every popstate event. popstate only fires for
  // same-document history changes; if Back takes the browser to a different
  // origin (e.g. login.microsoftonline.com), this document is torn down and
  // this listener never fires at all — that absence is itself evidence.
  useEffect(() => {
    captureDiagnostics("app mounted (fresh document load)");
    const handlePopState = () => {
      captureDiagnostics("popstate fired (same-document history navigation)");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Redirect unauthenticated users on the /homepage route back to the root path /
  useEffect(() => {
    if (
      !user &&
      inProgress === "none" &&
      accounts.length === 0 &&
      window.location.pathname === "/homepage" &&
      !hasMsalAuthResponseInUrl()
    ) {
      window.history.replaceState({}, "", "/");
    }
  }, [user, inProgress, accounts]);

  // For automated testing: allow passing test_login=true to bypass MSAL and authenticate instantly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("test_login") === "true") {
      sessionStorage.setItem("test_login", "true");
    }
    if (sessionStorage.getItem("test_login") === "true" && !user) {
      if (authRequestRef.current !== "idle") return;
      authRequestRef.current = "pending";
      fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: "mock-token" }),
      })
        .then((res) => res.json())
        .then((payload) => {
          setApiEmail(payload.email || "testuser@example.com");
          if (payload.session_id) {
            sessionStorage.setItem("session_id", payload.session_id);
            setSessionId(payload.session_id);
          }
          setUser({
            display_name: payload.display_name || "Test User",
            email: payload.email || "testuser@example.com",
          });
          authRequestRef.current = "done";
        })
        .catch((err) => {
          console.error("Mock login fetch failed, falling back to local state:", err);
          setApiEmail("testuser@example.com");
          setUser({
            display_name: "Test User",
            email: "testuser@example.com",
          });
          authRequestRef.current = "idle";
        });
    }
  }, [user]);

  // Handle the OAuth redirect coming straight back from Microsoft. We read the
  // AuthenticationResult directly from handleRedirectPromise (rather than waiting
  // on MsalProvider's internal accounts-array wiring + a second acquireTokenSilent
  // round trip) so a failure here surfaces immediately instead of silently
  // falling back to the login page with no explanation.
  useEffect(() => {
    let active = true;
    // initialize() is idempotent/safe to call again here — MsalProvider also
    // calls it, but handleRedirectPromise() throws if called before it resolves.
    instance
      .initialize()
      .then(() => instance.handleRedirectPromise())
      .then(async (result) => {
        console.info("[auth] handleRedirectPromise resolved:", result);
        captureDiagnostics(
          result?.account ? "after redirect (with account)" : "after redirect (no result)"
        );
        if (!active) return;
        if (!result || !result.account) {
          console.info(
            "[auth] No redirect result on this load (expected on a normal page load; " +
              "unexpected right after approving Microsoft sign-in)."
          );
          return;
        }
        // Claim the login synchronously before awaiting anything — if the
        // auto-authenticate effect's own promise resolves and its callback
        // runs before this one, it will see "pending"/"done" and bail out
        // instead of also calling /api/auth/login for the same sign-in.
        if (authRequestRef.current !== "idle") return;
        authRequestRef.current = "pending";
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: result.accessToken,
              tenant_id: result.account.tenantId || "",
            }),
          });
          if (!active) return;
          if (res.ok) {
            const payload = await res.json();
            const email = payload.email || result.account.username;
            setApiEmail(email);
            // Store and attach the server-side session ID
            if (payload.session_id) {
              sessionStorage.setItem("session_id", payload.session_id);
              setSessionId(payload.session_id);
            }
            setUser({
              display_name:
                payload.display_name || result.account.name || result.account.username,
              email: email,
            });
            authRequestRef.current = "done";
          } else {
            // Try to extract a meaningful message from the response body
            let errMsg = "Signed in with Microsoft, but the server rejected the session. Please try again.";
            try {
              const errBody = await res.json();
              if (errBody?.detail?.message) errMsg = errBody.detail.message;
              else if (typeof errBody?.detail === "string") errMsg = errBody.detail;
            } catch {}
            setAuthError(errMsg);
            authRequestRef.current = "idle";
          }
        } catch (e) {
          if (active) {
            console.error("Backend login sync failed after redirect", e);
            setAuthError("Could not reach the server to complete sign-in. Please try again.");
          }
          authRequestRef.current = "idle";
        }
      })
      .catch((err) => {
        if (active) {
          console.error("MSAL redirect handling failed", err);
          setAuthError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
        }
      });
    return () => {
      active = false;
    };
  }, [instance]);

  // Auto-authenticate from a cached MSAL session (only when MSAL is fully settled)
  useEffect(() => {
    let active = true;
    console.info("[auth] auto-authenticate check:", {
      inProgress,
      accountsLength: accounts.length,
      hasUser: !!user,
      pathname: window.location.pathname,
    });
    if (
      inProgress === "none" &&
      accounts.length > 0 &&
      !user &&
      !authError &&
      window.location.pathname !== "/signout"
    ) {
      const account = accounts[0];
      instance
        .acquireTokenSilent({
          scopes: ["User.Read"],
          account: account,
        })
        .then(async (response) => {
          console.info("[auth] acquireTokenSilent succeeded, calling /api/auth/login");
          if (!active) return;
          // Same claim as the redirect-handler effect above — whichever of
          // the two actually gets here first wins; the other bails out.
          if (authRequestRef.current !== "idle") return;
          authRequestRef.current = "pending";
          try {
            const res = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: response.accessToken,
                tenant_id: account.tenantId || "",
              }),
            });
            console.info("[auth] /api/auth/login responded with status:", res.status);
            if (res.ok) {
              const payload = await res.json();
              const email = payload.email || account.username;
              setApiEmail(email);
              // Store and attach the server-side session ID
              if (payload.session_id) {
                sessionStorage.setItem("session_id", payload.session_id);
                setSessionId(payload.session_id);
              }
              setUser({
                display_name: payload.display_name || account.name || account.username,
                email,
              });
              setAuthError(null);
              authRequestRef.current = "done";
            } else {
              const body = await res.text();
              // Try to extract a structured error message
              let errMsg = `Signed in with Microsoft, but the server rejected the session (Code ${res.status}). Please try again.`;
              try {
                const errBody = JSON.parse(body);
                if (errBody?.detail?.message) errMsg = errBody.detail.message;
                else if (typeof errBody?.detail === "string") errMsg = errBody.detail;
              } catch {}
              console.error("Backend validation failed during auto-login:", res.status, body);
              setAuthError(errMsg);
              authRequestRef.current = "idle";
            }
          } catch (e) {
            console.error("Backend login sync failed during auto-login", e);
            setAuthError(`Could not reach the server to complete sign-in. Connection failed: ${e instanceof Error ? e.message : String(e)}`);
            authRequestRef.current = "idle";
          }
        })
        .catch((err) => {
          console.error("Token acquisition failed during auto-login", err);
          setAuthError(`Token acquisition failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
    return () => {
      active = false;
    };
  }, [accounts, inProgress, user, authError, instance]);

  useEffect(() => {
    if (!user) {
      setProfilePhoto(null);
      return;
    }
    getProfile(user.email)
      .then((data) => {
        setProfilePhoto(data.photo_base64 || null);
      })
      .catch(() => {});
  }, [user]);

  // Marks this browser as having completed a successful login before, so the
  // next visit to the login page can greet with "Welcome Back" instead of "Welcome".
  useEffect(() => {
    if (!user) return;
    try {
      if (localStorage.getItem(RETURNING_USER_STORAGE_KEY) !== "true") {
        localStorage.setItem(RETURNING_USER_STORAGE_KEY, "true");
      }
    } catch {
      // Ignore storage errors (e.g. private browsing) — greeting just falls back to default.
    }
  }, [user]);

  const handleDismissApprovalResult = useCallback((id: string) => {
    setPendingApprovalRequests((prev) => prev.filter((x) => x.id !== id));
    if (user) {
      const seenKey = `seen_approvals_${user.email}`;
      const seenIds = JSON.parse(localStorage.getItem(seenKey) || "[]") as string[];
      if (!seenIds.includes(id)) {
        seenIds.push(id);
        localStorage.setItem(seenKey, JSON.stringify(seenIds));
      }
    }
  }, [user]);

  const dismissRef = useRef(handleDismissApprovalResult);
  useEffect(() => {
    dismissRef.current = handleDismissApprovalResult;
  }, [handleDismissApprovalResult]);

  const isFirstCheckRef = useRef(true);

  useEffect(() => {
    isFirstCheckRef.current = true;
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
      
      // Fetch notifications feed
      let rawApprovals = [];
      try {
        if (isAdmin) {
          rawApprovals = await listApprovals(user.email);
        } else {
          rawApprovals = await listMyApprovals();
        }
        const items: NotificationItem[] = rawApprovals.map((a: any) => {
          const displayName = a.filename || a.target_description || "";
          let message = "";
          let timestamp = a.uploaded_at;
          if (a.status === "pending") {
            // Backend already composes the exact "X is requesting approval to..."
            // sentence with full context (requester, department, vessel, target).
            message = a.message || `Awaiting reviewer approval: ${displayName}`;
          } else if (a.entry_kind === "activity") {
            // SPE Admin action that bypassed approval — not something the
            // acting admin needs a personal "your request was decided" toast
            // for, but it still belongs in the activity feed.
            message = a.message || `"${displayName}" — completed, no approval required.`;
            timestamp = a.decided_at || a.uploaded_at;
          } else if (a.status === "approved") {
            message = `"${displayName}" has been approved`;
            timestamp = a.decided_at || a.uploaded_at;
          } else if (a.status === "rejected") {
            message = `"${displayName}" was rejected` + (a.rejection_reason ? `: ${a.rejection_reason}` : "");
            timestamp = a.decided_at || a.uploaded_at;
          }
          return {
            id: a.id,
            filename: displayName,
            status: a.status,
            timestamp,
            message,
            uploader: a.uploaded_by_name || a.uploaded_by_email,
            rejectionReason: a.rejection_reason,
          };
        });
        items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setNotifications(items);
      } catch (err) {
        console.error("Failed to fetch notifications feed", err);
      }

      // Fetch decided approvals for personal toast alerts. Admin-activity
      // rows are never "approved"/"rejected" (they're inserted already
      // "completed"), so this naturally excludes them — the acting admin
      // doesn't need a personal "your request was decided" toast for
      // something they already did themselves.
      const myApprovals = await listMyApprovals();
      const decided = myApprovals.filter(a => a.status === "approved" || a.status === "rejected");
      
      const seenKey = `seen_approvals_${user.email}`;
      const seenIds = JSON.parse(localStorage.getItem(seenKey) || "[]") as string[];
      
      if (isFirstCheckRef.current) {
        // Suppress showing toast alerts for historical approvals decided in the past
        const decidedIds = decided.map(a => a.id);
        const initialSeen = Array.from(new Set([...seenIds, ...decidedIds]));
        localStorage.setItem(seenKey, JSON.stringify(initialSeen));
        isFirstCheckRef.current = false;
        return;
      }

      const newDecided = decided.filter(a => !seenIds.includes(a.id));
      if (newDecided.length > 0) {
        const itemsToShow: ApprovalResultItem[] = newDecided.map(a => ({
          id: a.id,
          filename: a.filename || a.target_description || "",
          status: a.status as "approved" | "rejected",
          decidedAt: a.decided_at,
          rejectionReason: a.rejection_reason,
          finalPath: a.final_path,
        }));
        
        // Mark them as seen immediately so we don't trigger updates/popups on subsequent polls
        const updatedSeenIds = [...seenIds, ...itemsToShow.map(x => x.id)];
        localStorage.setItem(seenKey, JSON.stringify(updatedSeenIds));

        setPendingApprovalRequests((prev) => {
          const next = [...prev];
          itemsToShow.forEach(item => {
            if (!next.some(x => x.id === item.id)) {
              next.push(item);
              setTimeout(() => {
                dismissRef.current(item.id);
              }, 9000);
            }
          });
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to poll my approvals", err);
    }
  }, [user]);

  // Polling for user's pending/decided approvals & notifications
  useEffect(() => {
    if (!user) return;
    
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    
    return () => {
      clearInterval(interval);
    };
  }, [user, fetchNotifications]);

  // ── Global 401 handler: reason-aware session expiry ───────────────────────
  // Installed once when the user is authenticated. When any API call receives
  // a 401, we read the structured 'reason' field from the backend and show
  // the appropriate message before redirecting to the login page.
  useEffect(() => {
    if (!user) return;

    const interceptorId = (window as any).__sessionInterceptorId;

    // Remove any previously installed interceptor to avoid duplicates
    if (typeof interceptorId === "number") {
      try {
        // axios interceptors are module-level; import via dynamic reference
        const axiosModule = (window as any).__axiosInstance;
        if (axiosModule) axiosModule.interceptors.response.eject(interceptorId);
      } catch { /* no-op */ }
    }

    // We install a window-level listener instead of re-importing axios here
    // to avoid circular dependency issues. The api.ts interceptor already
    // enriches errors with sessionReason; we just need to react to them.
    const handleApiError = (event: CustomEvent) => {
      const { reason } = event.detail || {};
      if (reason === "revoked") {
        alert(
          "Your access was revoked by an administrator. " +
          "Please contact IT support if this was unexpected.\n\n" +
          "You will now be signed out."
        );
        expireSessionRef.current("inactivity");
        return;
      }
      if (reason === "expired") {
        // Token expired from backend — clear session and redirect to signout page with reason
        clearSessionId();
        sessionStorage.clear();
        clearLocalStoragePreserveTheme();
        const account = accounts[0] || instance.getActiveAccount();
        if (account) instance.setActiveAccount(null);
        window.location.href = "/signout?reason=expired";
        return;
      }
      expireSessionRef.current("inactivity");
    };

    window.addEventListener("session:unauthorized", handleApiError as EventListener);
    return () => {
      window.removeEventListener("session:unauthorized", handleApiError as EventListener);
    };
  }, [user]);

  const signOutRef = useRef<() => void>(() => { });
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireSessionRef = useRef<(reason: "inactivity" | "token_expiry") => void>(() => { });

  const navigateTo = useCallback((newView: "dashboard" | "explorer" | "vessels" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings" | "appearance", newPath: PathEntry[]) => {
    setView(newView);
    setPath(newPath);

    // Build query params
    const params = new URLSearchParams();
    params.set("view", newView);
    if (newPath.length > 0) {
      params.set("path", JSON.stringify(newPath));
    }

    const newUrl = `/homepage?${params.toString()}`;
    window.history.pushState({ view: newView, path: newPath }, "", newUrl);
  }, []);


  useEffect(() => {
    if (!user) return;

    const homeUrl = "/homepage?view=dashboard";
    console.log(`[HistoryGuard] user set — installing. historyLen(before)=${window.history.length}`);
    window.history.replaceState({ view: "dashboard", path: [], isInitial: true }, "", homeUrl);

    const TOPUP_SIZE = 5;
    const topUpBuffer = () => {
      for (let i = 0; i < TOPUP_SIZE; i++) {
        window.history.pushState({ view: "dashboard", path: [] }, "", homeUrl);
      }
      console.log(`[HistoryGuard] topped up buffer. historyLen(after)=${window.history.length}`);
    };
    topUpBuffer();

    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state || {}) as { view?: string; path?: PathEntry[]; isInitial?: boolean };
      console.log(`[HistoryGuard] popstate. state=`, state, `historyLen=${window.history.length}`);

      if (state.isInitial) {
        console.log(`[HistoryGuard] hit floor sentinel — bouncing forward + topping up`);
        window.history.forward();
        topUpBuffer();
        return;
      }

      if (state.view === "dashboard" || state.view === "explorer" || state.view === "vessels" || state.view === "profile" || state.view === "archive" || state.view === "recycle_bin" || state.view === "approvals" || state.view === "settings" || state.view === "appearance") {
        setView(state.view as "dashboard" | "explorer" | "vessels" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings" | "appearance");
        setPath(state.path || []);
      } else {
        setView("dashboard");
        setPath([]);
      }
    };

    window.addEventListener("popstate", handlePopState);
    console.log(`[HistoryGuard] listener attached`);
    return () => {
      console.log(`[HistoryGuard] cleanup — listener removed`);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [user]);

  useEffect(() => {
    if (user) {
      loadTop();
    }
  }, [loadTop, user]);

  const currentId = path.length ? path[path.length - 1].id : null;
  const pageKey = view === "dashboard"
    ? "dashboard"
    : view === "explorer"
      ? (path[0]?.name || "explorer")
      : view;
  const selectedVesselId = selectedVesselByPage[pageKey] ?? null;
  const selectedVesselObj = vessels.find((v) => v.id === selectedVesselId) ?? null;
  const selectedVesselName = selectedVesselObj?.name ?? null;
  const searchQuery = searchQueryByPage[pageKey] ?? "";

  // Use a ref so loadCurrent always sees the latest values without being
  // recreated on every render (which would re-trigger the effect below).
  const loadCurrentRef = useRef<(forceRefresh?: boolean) => Promise<void>>(async () => {});

  const loadCurrent = useCallback(async (forceRefresh = false) => {
    return loadCurrentRef.current(forceRefresh);
  }, []);

  useEffect(() => {
    loadCurrentRef.current = async (forceRefresh = false) => {
      if (!currentId) {
        setCurrent(null);
        setChildren(mains);
        return;
      }

      // Show cached data immediately — no loading spinner, no API call
      const cachedNode = nodesCacheRef.current.get(currentId);
      const cachedKids = childrenCacheRef.current.get(currentId);
      if (!forceRefresh && cachedNode && cachedKids) {
        setCurrent(cachedNode);
        setChildren(cachedKids);
        return;
      }
      if (!forceRefresh && cachedKids) {
        setChildren(cachedKids);
      }

      setLoadingChildren(!cachedKids || forceRefresh);
      try {
        const nodePromise = cachedNode && !forceRefresh
          ? Promise.resolve(cachedNode)
          : getFolder(currentId);
        const [node, kids] = await Promise.all([nodePromise, getChildren(currentId)]);
        nodesCacheRef.current.set(currentId, node);
        childrenCacheRef.current.set(currentId, kids);
        kids.forEach((k) => nodesCacheRef.current.set(k.id, k));
        setCurrent(node);
        setChildren(kids);
      } catch (e) {
        const detail = errDetail(e, "Could not load folder contents.");
        const id = Date.now();
        setToasts((prev) => [
          ...prev,
          { id, status: "failed" as const, title: "Folder load error", detail },
        ]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
      } finally {
        setLoadingChildren(false);
      }
    };
  }); // intentionally no deps — always captures latest closure values

  useEffect(() => {
    if (user && (view === "explorer" || view === "archive")) {
      void loadCurrentRef.current();
    }
  }, [view, currentId, user]);

  useEffect(() => {
    if (user && view === "recycle_bin") {
      getDeletedNodes().then(setDeletedNodes).catch(console.error);
    }
  }, [view, user]);

  useEffect(() => {
    setFQuery(""); // reset in-folder filter when navigating
    setListViewMode(false); // reset to folder view on navigation
  }, [currentId]);

  // ----- navigation -----
  const goDashboard = () => navigateTo("dashboard", []);
  const goVessels = () => navigateTo("vessels", []);
  const goProfile = () => navigateTo("profile", []);
  const goApprovals = () => navigateTo("approvals", []);
  const goSettings = () => navigateTo("settings", []);
  const openMainToSelectedVessel = useCallback(async (node: FolderNode): Promise<boolean> => {
    const selectedForMainId =
      selectedVesselByPage[node.name] ??
      selectedVesselByPage.vessels ??
      null;
    const selectedForMainName =
      vessels.find((v) => v.id === selectedForMainId)?.name?.trim().toLowerCase() ?? null;

    if (selectedForMainName) {
      try {
        const mainChildren = await getChildren(node.id);
        const vesselNode = mainChildren.find(
          (c) =>
            c.kind !== "file" &&
            c.name.trim().toLowerCase() === selectedForMainName
        );
        if (vesselNode) {
          navigateTo("explorer", [
            { id: node.id, name: node.name },
            { id: vesselNode.id, name: vesselNode.name },
          ]);
          return true;
        }
      } catch {
        // If lookup fails, fall back to opening the main folder level.
      }
    }

    return false;
  }, [navigateTo, selectedVesselByPage, vessels]);

  const openMain = async (node: FolderNode) => {
    const opened = await openMainToSelectedVessel(node);
    if (!opened) {
      navigateTo("explorer", [{ id: node.id, name: node.name }]);
    }
  };
  const openChild = (node: FolderNode) => {
    if (node.kind === "file") return;
    if (node.kind === "main") {
      void (async () => {
        const opened = await openMainToSelectedVessel(node);
        if (!opened) {
          navigateTo("explorer", [{ id: node.id, name: node.name }]);
        }
      })();
      return;
    }
    // Pre-populate node cache so the destination renders without a getFolder call
    nodesCacheRef.current.set(node.id, node);
    navigateTo("explorer", [...path, { id: node.id, name: node.name }]);
  };
  const crumbTo = (i: number) => {
    // In selected-vessel flow, clicking the main-folder crumb should return
    // to the mains landing page (Home) instead of showing main-level
    // Common/Vessels grouping cards.
    if (i === 1 && path.length >= 2 && selectedVesselByPage.vessels) {
      navigateTo("explorer", []);
      return;
    }
    navigateTo("explorer", i === 0 ? [] : path.slice(0, i));
  };

  const handleArchiveMenuToggle = (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (activeMenuFolderId !== folderId) {
      const rect = e.currentTarget.getBoundingClientRect();
      const MENU_H = 150;
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipped = spaceBelow < MENU_H && rect.top > MENU_H;
      setArchiveMenuDropPos({
        top: flipped ? 0 : rect.bottom + 4,
        bottom: flipped ? window.innerHeight - rect.top + 4 : 0,
        right: window.innerWidth - rect.right,
        flipped,
      });
      setActiveMenuFolderId(folderId);
    } else {
      setActiveMenuFolderId(null);
    }
  };

  const crumbs: Crumb[] = useMemo(
    () => [{ id: null, name: "Home" }, ...path.map((p) => ({ id: p.id, name: p.name }))],
    [path]
  );

  const navigateToResult = (r: SearchResult) => {
    const trail = r.trail.slice();
    if (r.kind === "file") trail.pop();
    setView("explorer");
    setPath(trail.map((t) => ({ id: t.id, name: t.name })));
  };

  const openVesselFromDashboard = useCallback(async (vessel: Vessel) => {
    const pushOpenFailToast = (detail: string) => {
      setToasts((prev) => [
        ...prev,
        {
          id: Date.now(),
          status: "failed",
          title: "Could not open vessel",
          detail,
        },
      ]);
    };

    try {
      const results = await search(vessel.name);
      const normalized = vessel.name.trim().toLowerCase();
      const currentMainId = path[0]?.id;
      const pickBestShipHit = (candidates: SearchResult[]) => {
        if (candidates.length === 0) return undefined;
        if (currentMainId) {
          const inCurrentMain = candidates.find((r) => r.trail[0]?.id === currentMainId);
          if (inCurrentMain) return inCurrentMain;
        }

        const preferredMainOrder = ["Technical & Crewing", "Commercial & Chartering", "Insurance"];
        for (const mainName of preferredMainOrder) {
          const inPreferredMain = candidates.find((r) => r.trail[0]?.name === mainName);
          if (inPreferredMain) return inPreferredMain;
        }

        return candidates[0];
      };

      const exactShips = results.filter(
        (r) => r.kind === "ship" && r.name.trim().toLowerCase() === normalized
      );
      const anyShips = results.filter((r) => r.kind === "ship");
      const shipHit = pickBestShipHit(exactShips) ?? pickBestShipHit(anyShips);

      if (shipHit && shipHit.trail.length > 0) {
        navigateTo(
          "explorer",
          shipHit.trail.map((t) => ({ id: t.id, name: t.name }))
        );
        return;
      }

      if (mains.length > 0) {
        navigateTo("explorer", [{ id: mains[0].id, name: mains[0].name }]);
      }

      pushOpenFailToast(`Could not locate folder path for ${vessel.name}.`);
    } catch (e) {
      pushOpenFailToast(errDetail(e, `Failed to open ${vessel.name}.`));
    }
  }, [mains, navigateTo, path, setToasts]);

  const openVesselFromVesselsView = useCallback((vessel: Vessel) => {
    // Open main-folder page first, then keep the vessel preselected per main
    // so the user can choose a main and immediately see that vessel context.
    setSelectedVesselByPage((prev) => {
      const next: Record<string, string | null> = {
        ...prev,
        vessels: vessel.id,
      };
      for (const main of mains) {
        next[main.name] = vessel.id;
      }
      return next;
    });
    navigateTo("explorer", []);
  }, [mains, navigateTo]);

  // ----- displayed items (vessel scope + filter + sort) -----
  const displayed = useMemo(() => {
    let items = children.filter((c) => !archivedFolderIds.has(c.id));
    if (current?.kind === "main" && selectedVesselName)
      items = items.filter((c) => c.kind !== "ship" || c.name === selectedVesselName);
    const q = fQuery.trim().toLowerCase();
    if (q) items = items.filter((c) => c.name.toLowerCase().includes(q));
    items = items.filter((c) => matchesType(c, typeKey));
    return sortItems(items, sortKey, vessels);
  }, [children, current, selectedVesselName, fQuery, typeKey, sortKey, archivedFolderIds, vessels]);

  // ----- toasts -----
  const upsertToast = (t: ToastItem) =>
    setToasts((prev) => {
      const i = prev.findIndex((x) => x.id === t.id);
      if (i === -1) return [...prev, t];
      const copy = [...prev];
      copy[i] = t;
      return copy;
    });
  const dismissToast = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));


  const refreshAfterMutation = useCallback(async () => {
    // Invalidate cache for current folder so next load fetches fresh data
    if (currentId) childrenCacheRef.current.delete(currentId);
    await Promise.all([
      loadCurrent(true),
      getStats().then(setStats),
      getDeletedNodes().then(setDeletedNodes),
      getArchivedNodes().then(setArchivedNodes),
    ]);
  }, [loadCurrent, currentId]);

  const handleUpload = useCallback(
    async (node: FolderNode, file: File, category?: string) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      upsertToast({
        id,
        status: "processing",
        title: `Uploading ${file.name}`,
        detail: node.month_driven ? "Detecting month from document…" : `to ${node.name}`,
      });
      try {
        const job = node.month_driven
          ? await monthUpload(node.id, file, category)
          : await uploadFile(node.id, file);
        let final = job;
        for (let i = 0; i < 10 && final.status === "processing"; i++) {
          await sleep(500);
          final = await getJob(job.id);
        }
        const title =
          final.status === "done"
            ? "Uploaded & filed"
            : final.status === "pending"
              ? "Awaiting approval"
              : "Upload failed";
        upsertToast({
          id,
          status: final.status,
          title,
          detail:
            final.status === "pending"
              ? "Awaiting reviewer approval"
              : final.status === "done" && final.destination
                ? formatUploadSuccessDetail(final.destination)
                : final.destination,
          detectedMonth: final.detected_month,
        });
        // Small delay: SharePoint may take a moment to index a newly uploaded file
        // before it appears in a list_children response.
        if (final.status === "done") await sleep(1200);
        await refreshAfterMutation();
        await fetchNotifications();
        if (final.status === "pending") {
          setShowUploadSuccessModal(true);
        }
        setTimeout(() => dismissToast(id), 6000);
      } catch (e) {
        const detail = errDetail(e, file.name);
        const isDuplicate =
          (e as { response?: { status?: number } })?.response?.status === 409 ||
          detail.toLowerCase().includes("already exists") ||
          detail.toLowerCase().includes("duplicate");
        upsertToast({
          id,
          status: "failed",
          title: isDuplicate ? "Duplicate File" : "Upload failed",
          detail,
        });

        if (isDuplicate) {
          await refreshAfterMutation();
          
          let currentVesselName = "";
          if (path.length >= 2) {
            currentVesselName = path[1].name;
          } else if (selectedVesselName) {
            currentVesselName = selectedVesselName;
          }

          let existingVesselName = "";
          let existingFolderId = "";
          let existingFolderPath = "";

          const deletedMatch = deletedNodes.find(
            (n) => n.name.toLowerCase() === file.name.toLowerCase() && n.kind === "file"
          );

          if (deletedMatch) {
            existingFolderId = "recycle_bin";
            existingFolderPath = `Recycle Bin / ${deletedMatch.name}`;
            existingVesselName = currentVesselName;
          } else {
            try {
              const searchResults = await search(file.name, selectedVesselId || undefined);
              const exactMatch = searchResults.find(
                (r) => r.name.toLowerCase() === file.name.toLowerCase() && r.kind === "file"
              );
              if (exactMatch) {
                existingFolderId = exactMatch.trail[exactMatch.trail.length - 2]?.id || "";
                existingFolderPath = exactMatch.path;
                const parts = exactMatch.path.split("/");
                if (parts.length >= 2) {
                  existingVesselName = parts[1];
                }
              }
            } catch (err) {
              console.error("Search failed on duplicate check", err);
            }
          }

          const isSameVessel =
            existingVesselName &&
            currentVesselName &&
            existingVesselName.toLowerCase() === currentVesselName.toLowerCase();

          if (isSameVessel) {
            setDuplicateFileInfo({
              filename: file.name,
              vesselName: currentVesselName,
              existingFolderId,
              existingFolderPath,
            });
          }
        }
        setTimeout(() => dismissToast(id), 8000);
      }
    },
    [refreshAfterMutation, user, path, selectedVesselName, selectedVesselId, deletedNodes]
  );

  const handleDelete = useCallback(
    async (node: FolderNode) => {
      // Show custom in-page confirmation modal instead of window.confirm
      setDeleteFileNode(node);
    },
    []
  );

  const confirmDeleteFile = useCallback(
    async (reason?: string) => {
      if (!deleteFileNode) return;
      const node = deleteFileNode;
      setDeleteFileNode(null);
      setDeleteReason("");
      const id = Date.now() + Math.floor(Math.random() * 1000);
      try {
        const result =
          node.kind === "file"
            ? await deleteFile(node.id, user?.email, reason)
            : await deleteFolder(node.id, user?.email, node.name);
        if (result.status === "pending") {
          upsertToast({ id, status: "pending", title: "Awaiting approval", detail: result.message || node.name });
        } else {
          await refreshAfterMutation();
          upsertToast({ id, status: "done", title: "Moved to Recycle Bin", detail: node.name });
        }
      } catch (e) {
        upsertToast({ id, status: "failed", title: "Delete failed", detail: errDetail(e, node.name) });
      }
      setTimeout(() => dismissToast(id), 5500);
    },
    [deleteFileNode, refreshAfterMutation, user]
  );

  const handleDownload = useCallback((node: FolderNode) => {
    const a = document.createElement("a");
    a.href = fileContentUrl(node.id);
    a.download = node.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const downloadFolderRecursively = useCallback(async (node: FolderNode) => {
    const toastId = Date.now() + Math.floor(Math.random() * 1000);
    upsertToast({
      id: toastId,
      status: "processing",
      title: `Downloading folder "${node.name}"`,
      detail: "Fetching file list...",
    });

    try {
      let fileCount = 0;
      const downloadAll = async (folderId: string) => {
        const items = await getChildren(folderId);
        for (const item of items) {
          if (item.kind === "file") {
            const a = document.createElement("a");
            a.href = fileContentUrl(item.id);
            a.download = item.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            fileCount++;
            await sleep(200); // 200ms delay to prevent pop-up blocker
          } else {
            await downloadAll(item.id);
          }
        }
      };
      await downloadAll(node.id);
      
      upsertToast({
        id: toastId,
        status: "done",
        title: `Downloaded folder "${node.name}"`,
        detail: `Successfully downloaded ${fileCount} file(s).`,
      });
    } catch (e) {
      upsertToast({
        id: toastId,
        status: "failed",
        title: "Download failed",
        detail: "Could not retrieve folder contents.",
      });
    }
    setTimeout(() => dismissToast(toastId), 4000);
  }, [upsertToast, dismissToast]);

  const handleRenew = useCallback(
    async (node: FolderNode, newFile: File) => {
      if (!current) return;
      const id = Date.now() + Math.floor(Math.random() * 1000);
      upsertToast({ id, status: "processing", title: `Renewing ${node.name}`, detail: "Uploading new version…" });
      try {
        const job = current.month_driven
          ? await monthUpload(current.id, newFile, undefined)
          : await uploadFile(current.id, newFile);
        let final = job;
        for (let i = 0; i < 10 && final.status === "processing"; i++) {
          await sleep(500);
          final = await getJob(job.id);
        }
        upsertToast({
          id,
          status: final.status,
          title:
            final.status === "done"
              ? "Document renewed"
              : final.status === "pending"
                ? "Awaiting approval"
                : "Renew failed",
          detail:
            final.status === "pending"
              ? "Awaiting reviewer approval"
              : final.destination,
          detectedMonth: final.detected_month,
        });
        await refreshAfterMutation();
        await fetchNotifications();
        if (final.status === "pending") {
          setShowUploadSuccessModal(true);
        }
        setTimeout(() => dismissToast(id), 6000);
      } catch (e) {
        upsertToast({ id, status: "failed", title: "Renew failed", detail: errDetail(e, node.name) });
        setTimeout(() => dismissToast(id), 6000);
      }
    },
    [current, refreshAfterMutation]
  );

  const handleBulkFolderArchive = useCallback(async (reason?: string) => {
    if (archiveSelectIds.size === 0) return;
    const nodesToArchive = children.filter((c) => archiveSelectIds.has(c.id));
    const completedNodes: FolderNode[] = [];
    let pendingCount = 0;

    try {
      const results = await Promise.all(
        nodesToArchive.map((n) =>
          archiveItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined, {
            itemName: n.name,
            reason,
          })
        )
      );
      results.forEach((r, i) => {
        if (r.status === "pending") pendingCount++;
        else completedNodes.push(nodesToArchive[i]);
      });
    } catch (e) {
      console.error("Failed to archive items in DB:", e);
    }

    if (completedNodes.length > 0) {
      setArchivedFolderIds((prev) => {
        const next = new Set(prev);
        completedNodes.forEach((n) => next.add(n.id));
        return next;
      });
      setArchivedNodes((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        return [...prev, ...completedNodes.filter((n) => !existingIds.has(n.id))];
      });
      if (user?.email) {
        completedNodes.forEach((n) =>
          logActivity(user.email, n.kind === "file" ? "archive_file" : "archive_folder", `Archived ${n.kind === "file" ? "file" : "folder"}: ${n.name}`)
        );
      }
    }
    setShowArchiveSelectModal(false);
    setShowArchiveReasonModal(false);
    setArchiveReason("");
    setArchiveSelectIds(new Set());

    const tid = Date.now() + Math.floor(Math.random() * 1000);
    const detail =
      pendingCount > 0
        ? completedNodes.length > 0
          ? `${completedNodes.length} archived, ${pendingCount} awaiting approval`
          : `${pendingCount} item(s) awaiting approval`
        : nodesToArchive.map((n) => n.name).join(", ");
    upsertToast({
      id: tid,
      status: pendingCount > 0 && completedNodes.length === 0 ? "pending" : "done",
      title: pendingCount > 0 ? "Archive requested" : `${nodesToArchive.length} item${nodesToArchive.length !== 1 ? "s" : ""} archived`,
      detail,
    });
    setTimeout(() => dismissToast(tid), 4000);
  }, [archiveSelectIds, children, user]);

  const handleFolderArchive = useCallback(async (node: FolderNode) => {
    const isRestoring = archivedNodes.some((n) => n.id === node.id);
    let result: { status: "completed" | "pending"; message?: string } | null = null;

    try {
      result = isRestoring
        ? await restoreItem(node.id, user?.email || undefined, node.kind === "file" ? "file" : "folder", { itemName: node.name })
        : await archiveItem(node.id, node.kind === "file" ? "file" : "folder", user?.email || undefined, { itemName: node.name });
    } catch (e) {
      console.error("Failed to archive/restore item in DB:", e);
    }

    const tid2 = Date.now() + Math.floor(Math.random() * 1000);
    if (result?.status === "pending") {
      upsertToast({
        id: tid2,
        status: "pending",
        title: "Awaiting approval",
        detail: result.message || node.name,
      });
      setTimeout(() => dismissToast(tid2), 6000);
      return;
    }

    setArchivedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) { next.delete(node.id); } else { next.add(node.id); }
      return next;
    });
    setArchivedNodes((prev) =>
      prev.some((n) => n.id === node.id)
        ? prev.filter((n) => n.id !== node.id)   // restore: remove from list
        : [...prev, node]                          // archive: add to list
    );
    // Log activity
    if (user?.email) {
      logActivity(
        user.email,
        isRestoring ? "restore_folder" : (node.kind === "file" ? "archive_file" : "archive_folder"),
        isRestoring ? `Restored folder/file: ${node.name}` : `Archived ${node.kind === "file" ? "file" : "folder"}: ${node.name}`
      );
    }
    // Success toast
    upsertToast({
      id: tid2,
      status: "done",
      title: isRestoring ? `"${node.name}" restored` : `"${node.name}" archived`,
      detail: isRestoring ? "Item is visible again" : "Item hidden from main view",
    });
    setTimeout(() => dismissToast(tid2), 4000);
  }, [archivedNodes, user]);

  const handleBulkFolderDelete = useCallback(async () => {
    if (deleteFolderIds.size === 0) return;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const nameMap = new Map(children.map((c) => [c.id, c.name]));
    const idsToDelete = [...deleteFolderIds];
    setShowDeleteModal(false);
    upsertToast({ id, status: "processing", title: `Moving ${idsToDelete.length} folder(s) to Recycle Bin…`, detail: "Please wait" });
    try {
      // Execute sequentially to prevent SQLite write conflicts and SharePoint API throttling
      let completed = 0;
      let pending = 0;
      for (const fid of idsToDelete) {
        const result = await deleteFolder(fid, user?.email, nameMap.get(fid));
        if (result.status === "pending") pending++;
        else completed++;
      }
      if (completed > 0) await refreshAfterMutation();
      const detail =
        pending > 0
          ? completed > 0
            ? `${completed} deleted, ${pending} awaiting approval`
            : `${pending} folder(s) awaiting approval`
          : `${idsToDelete.length} folder(s) moved to Recycle Bin`;
      upsertToast({
        id,
        status: pending > 0 && completed === 0 ? "pending" : "done",
        title: pending > 0 ? "Delete requested" : "Folders soft-deleted",
        detail,
      });
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Delete failed", detail: errDetail(e, "") });
    }
    setDeleteFolderIds(new Set());
    setTimeout(() => dismissToast(id), 5000);
  }, [deleteFolderIds, children, refreshAfterMutation, user]);

  const handleBulkFileDelete = useCallback(async () => {
    if (deleteFileIds.size === 0) return;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const idsToDelete = [...deleteFileIds];
    setShowDeleteFilesModal(false);
    upsertToast({ id, status: "processing", title: `Moving ${idsToDelete.length} file(s) to Recycle Bin…`, detail: "Please wait" });
    try {
      // Execute sequentially to prevent SQLite write conflicts and SharePoint API throttling
      let completed = 0;
      let pending = 0;
      for (const fid of idsToDelete) {
        const result = await deleteFile(fid, user?.email);
        if (result.status === "pending") pending++;
        else completed++;
      }
      if (completed > 0) await refreshAfterMutation();
      const detail =
        pending > 0
          ? completed > 0
            ? `${completed} deleted, ${pending} awaiting approval`
            : `${pending} file(s) awaiting approval`
          : `${idsToDelete.length} file(s) moved to Recycle Bin`;
      upsertToast({
        id,
        status: pending > 0 && completed === 0 ? "pending" : "done",
        title: pending > 0 ? "Delete requested" : "Files soft-deleted",
        detail,
      });
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Delete failed", detail: errDetail(e, "") });
    }
    setDeleteFileIds(new Set());
    setTimeout(() => dismissToast(id), 5000);
  }, [deleteFileIds, refreshAfterMutation, user]);

  const handleBulkRestoreDeleted = useCallback(async () => {
    if (recycleSelectIds.size === 0) return;
    const id = Date.now();
    upsertToast({ id, status: "processing", title: `Restoring selected items…`, detail: "Please wait" });
    try {
      const selected = deletedNodes.filter(n => recycleSelectIds.has(n.id));
      // Execute sequentially to prevent SQLite write conflicts and SharePoint API throttling
      let completed = 0;
      let pending = 0;
      for (const n of selected) {
        const result = await restoreDeletedItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined, {
          itemName: n.name,
          department: n.main_folder,
        });
        if (result.status === "pending") pending++;
        else completed++;
      }
      if (completed > 0) await refreshAfterMutation();
      const detail =
        pending > 0
          ? completed > 0
            ? `${completed} restored, ${pending} awaiting approval`
            : `${pending} item(s) awaiting approval`
          : "Items are visible again";
      upsertToast({
        id,
        status: pending > 0 && completed === 0 ? "pending" : "done",
        title: pending > 0 ? "Restore requested" : "Selected items restored",
        detail,
      });
      setRecycleSelectIds(new Set());
      setShowRecycleSelectModal(false);
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Restore failed", detail: errDetail(e, "") });
    }
    setTimeout(() => dismissToast(id), 5000);
  }, [recycleSelectIds, deletedNodes, refreshAfterMutation, user]);

  const handleRestoreAll = useCallback(async () => {
    if (deletedNodes.length === 0) return;
    const id = Date.now();
    upsertToast({ id, status: "processing", title: `Restoring all ${deletedNodes.length} items…`, detail: "Please wait" });
    try {
      let completed = 0;
      let pending = 0;
      for (const n of deletedNodes) {
        const result = await restoreDeletedItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined, {
          itemName: n.name,
          department: n.main_folder,
        });
        if (result.status === "pending") pending++;
        else completed++;
      }
      if (completed > 0) await getDeletedNodes().then(setDeletedNodes);
      const detail =
        pending > 0
          ? completed > 0
            ? `${completed} restored, ${pending} awaiting approval`
            : `${pending} item(s) awaiting approval`
          : "Items are visible again in the explorer";
      upsertToast({
        id,
        status: pending > 0 && completed === 0 ? "pending" : "done",
        title: pending > 0 ? "Restore requested" : "All items restored",
        detail,
      });
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Restore failed", detail: errDetail(e, "") });
    }
    setTimeout(() => dismissToast(id), 5000);
  }, [deletedNodes, user]);

  const handleRestoreSingleDeleted = useCallback((n: FolderNode) => {
    const id = Date.now();
    upsertToast({ id, status: "processing", title: "Restoring…", detail: n.name });
    restoreDeletedItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined, {
      itemName: n.name,
      department: n.main_folder,
    })
      .then(async (result) => {
        if (result.status === "pending") {
          upsertToast({ id, status: "pending", title: "Awaiting approval", detail: result.message || n.name });
          return;
        }
        await getDeletedNodes().then(setDeletedNodes);
        upsertToast({ id, status: "done", title: "Restored", detail: `"${n.name}" restored` });
      })
      .catch((e) => upsertToast({ id, status: "failed", title: "Restore failed", detail: errDetail(e, "") }))
      .finally(() => setTimeout(() => dismissToast(id), 4000));
  }, [user]);

  const handleEmptyRecycleBin = useCallback(async () => {
    if (deletedNodes.length === 0) return;
    const id = Date.now();
    upsertToast({ id, status: "processing", title: "Emptying Recycle Bin…", detail: "Please wait" });
    try {
      let completed = 0;
      let pending = 0;
      for (const n of deletedNodes) {
        const result = await permanentDeleteItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined, {
          itemName: n.name,
          department: n.main_folder,
        });
        if (result.status === "pending") pending++;
        else completed++;
      }
      if (completed > 0) await getDeletedNodes().then(setDeletedNodes);
      const detail =
        pending > 0
          ? completed > 0
            ? `${completed} deleted, ${pending} awaiting approval`
            : `${pending} item(s) awaiting approval`
          : "All items permanently deleted";
      upsertToast({
        id,
        status: pending > 0 && completed === 0 ? "pending" : "done",
        title: pending > 0 ? "Delete requested" : "Recycle Bin emptied",
        detail,
      });
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Empty failed", detail: errDetail(e, "") });
    }
    setTimeout(() => dismissToast(id), 5000);
  }, [deletedNodes, user]);

  const [recycleSortKey, setRecycleSortKey] = useState<"name" | "deleted_at" | "size" | "modified">("deleted_at");
  const [recycleSortDir, setRecycleSortDir] = useState<"asc" | "desc">("desc");
  const [recycleLayout, setRecycleLayout] = useState<"list" | "grid">("list");

  const handleBulkPermanentDelete = useCallback(() => {
    if (recycleSelectIds.size === 0) return;
    setShowBulkDeleteRecycleModal(true);
  }, [recycleSelectIds]);

  const executeBulkPermanentDelete = useCallback(async () => {
    setShowBulkDeleteRecycleModal(false);
    if (recycleSelectIds.size === 0) return;
    const id = Date.now();
    upsertToast({ id, status: "processing", title: "Permanently deleting selected items…", detail: "Please wait" });
    try {
      const selected = deletedNodes.filter(n => recycleSelectIds.has(n.id));
      // Execute sequentially to prevent SQLite write conflicts and SharePoint API throttling
      let completed = 0;
      let pending = 0;
      for (const n of selected) {
        const result = await permanentDeleteItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined, {
          itemName: n.name,
          department: n.main_folder,
        });
        if (result.status === "pending") pending++;
        else completed++;
      }
      if (completed > 0) await refreshAfterMutation();
      const detail =
        pending > 0
          ? completed > 0
            ? `${completed} deleted, ${pending} awaiting approval`
            : `${pending} item(s) awaiting approval`
          : "Items removed forever";
      upsertToast({
        id,
        status: pending > 0 && completed === 0 ? "pending" : "done",
        title: pending > 0 ? "Delete requested" : "Selected items permanently deleted",
        detail,
      });
      setRecycleSelectIds(new Set());
      setShowRecycleSelectModal(false);
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Delete failed", detail: errDetail(e, "") });
    }
    setTimeout(() => dismissToast(id), 5000);
  }, [recycleSelectIds, deletedNodes, refreshAfterMutation, user]);

  const handleCreate = async (data: import("./api").VesselInput) => {
    const toastId = Date.now() + Math.floor(Math.random() * 1000);
    upsertToast({
      id: toastId,
      status: "processing",
      title: "Creating vessel...",
      detail: `Provisioning SharePoint folders for "${data.name}"`,
    });
    try {
      const result = await createVessel(data);

      if (result.status === "pending") {
        setShowModal(false);
        upsertToast({
          id: toastId,
          status: "pending",
          title: "Awaiting approval",
          detail: result.message || `Vessel "${data.name}" is awaiting approval`,
        });
        setTimeout(() => dismissToast(toastId), 6000);
        return;
      }

      // Close the modal immediately so the user isn't stuck
      setShowModal(false);

      upsertToast({
        id: toastId,
        status: "done",
        title: "Vessel created",
        detail: `Successfully created vessel "${data.name}"`,
      });

      // Reload vessels, mains, stats, archive, deleted in parallel
      const [freshMains, freshVessels, freshStats, archIds, archNodes, delNodes] = await Promise.all([
        getMains(),
        listVessels(),
        getStats(),
        getArchivedIds(),
        getArchivedNodes(),
        getDeletedNodes(),
      ]);
      setMains(freshMains);
      setVessels(freshVessels);
      setStats(freshStats);
      setArchivedFolderIds(new Set(archIds));
      setArchivedNodes(archNodes);
      setDeletedNodes(delNodes);

      // Now refresh current folder children
      if (!currentId) {
        setCurrent(null);
        setChildren(freshMains);
      } else {
        try {
          const [node, kids] = await Promise.all([
            getFolder(currentId),
            getChildren(currentId),
          ]);
          setCurrent(node);
          setChildren(kids);
        } catch {
          // ignore
        }
      }

      setView("explorer");
    } catch (e) {
      upsertToast({
        id: toastId,
        status: "failed",
        title: "Vessel creation failed",
        detail: errDetail(e, `Could not create vessel "${data.name}"`),
      });
      // Re-throw so the modal's catch block can display the inline error
      throw e;
    }
    setTimeout(() => dismissToast(toastId), 5000);
  };

  const handleUpdateVessel = async (vesselId: string, data: Partial<import("./api").VesselInput>) => {
    const toastId = Date.now() + Math.floor(Math.random() * 1000);
    upsertToast({
      id: toastId,
      status: "processing",
      title: "Updating vessel...",
      detail: "Please wait",
    });
    try {
      const result = await updateVessel(vesselId, data);

      if (result.status === "pending") {
        upsertToast({
          id: toastId,
          status: "pending",
          title: "Awaiting approval",
          detail: result.message || `Vessel update for "${data.name || ""}" is awaiting approval`,
        });
        setTimeout(() => dismissToast(toastId), 6000);
        return;
      }

      // Reload vessels, mains, stats, archive, deleted in parallel
      const [freshMains, freshVessels, freshStats, archIds, archNodes, delNodes] = await Promise.all([
        getMains(),
        listVessels(),
        getStats(),
        getArchivedIds(),
        getArchivedNodes(),
        getDeletedNodes(),
      ]);
      setMains(freshMains);
      setVessels(freshVessels);
      setStats(freshStats);
      setArchivedFolderIds(new Set(archIds));
      setArchivedNodes(archNodes);
      setDeletedNodes(delNodes);

      // Now refresh children with fresh mains (bypasses stale closure)
      if (!currentId) {
        setCurrent(null);
        setChildren(freshMains);
      } else {
        try {
          const [node, kids] = await Promise.all([
            getFolder(currentId),
            getChildren(currentId),
          ]);
          setCurrent(node);
          setChildren(kids);
        } catch {
          // ignore
        }
      }

      upsertToast({
        id: toastId,
        status: "done",
        title: "Vessel updated",
        detail: result.message || `Successfully updated vessel "${data.name || ''}"`,
      });
    } catch (e) {
      upsertToast({
        id: toastId,
        status: "failed",
        title: "Update failed",
        detail: errDetail(e, "Failed to update vessel details."),
      });
    }
    setTimeout(() => dismissToast(toastId), 6000);
  };

  const handleCreateFolder = async () => {
    if (!current || !createFolderName.trim()) return;
    const cleaned = cleanFolderName(createFolderName);
    if (!/[a-zA-Z]/.test(cleaned)) {
      setCreateFolderError("Please include alphabetic characters (letters) in the folder name.");
      return;
    }
    setCreateFolderLoading(true);
    setCreateFolderError(null);
    try {
      const result = await createSubfolder(current.id, cleaned, user?.email);
      setShowCreateFolderModal(false);
      setCreateFolderName("");
      if (result.status === "pending") {
        const toastId = Date.now() + Math.floor(Math.random() * 1000);
        upsertToast({
          id: toastId,
          status: "pending",
          title: "Awaiting approval",
          detail: result.message || `Folder "${cleaned}" is awaiting approval`,
        });
        setTimeout(() => dismissToast(toastId), 6000);
      } else {
        if (currentId) childrenCacheRef.current.delete(currentId);
        await loadCurrent(true);
      }
    } catch (e) {
      setCreateFolderError(errDetail(e, "Failed to create folder. Please try again."));
    } finally {
      setCreateFolderLoading(false);
    }
  };

  const clearLocalStoragePreserveTheme = () => {
    try {
      const mode = localStorage.getItem("dms-theme-mode");
      const color = localStorage.getItem("dms-theme-color");
      localStorage.clear();
      if (mode) localStorage.setItem("dms-theme-mode", mode);
      if (color) localStorage.setItem("dms-theme-color", color);
    } catch {
      // Ignore storage access failures.
    }
  };

  const handleSignOut = async () => {
    const sessionId = sessionStorage.getItem("session_id") || undefined;
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email, session_id: sessionId }),
      });
    } catch (e) {
      console.error("Backend logout call failed", e);
    }

    clearSessionId();
    sessionStorage.clear();
    clearLocalStoragePreserveTheme();

    const account = accounts[0] || instance.getActiveAccount();
    if (account) {
      // Clear MSAL local token cache silently
      instance.setActiveAccount(null);
    }

    window.location.href = "/signout";
  };

  // ── Keep refs up-to-date so closures always see the latest version ────────
  signOutRef.current = handleSignOut;

  expireSessionRef.current = (reason) => {
    // Stop the periodic checker
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    // Backend logout (best-effort, non-blocking)
    const sessionId = sessionStorage.getItem("session_id") || undefined;
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user?.email, session_id: sessionId }),
    }).catch(() => { });
    // Clear session tracking
    clearSessionId();
    // MSAL silent cache clear
    const account = accounts[0] || instance.getActiveAccount();
    if (account) {
      instance.setActiveAccount(null);
    }
    sessionStorage.clear();
    clearLocalStoragePreserveTheme();
    setUser(null);
    setSessionExpiredReason(reason);
  };

  /** Sign out of ALL Microsoft accounts on this device (ends every SSO session) */
  const handleGlobalSignOut = async () => {
    // Revoke all server-side sessions for every MSAL account
    const currentSessionId = sessionStorage.getItem("session_id");
    const logoutPromises = accounts.map(account => {
      const email = account.username;
      return fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, session_id: currentSessionId || undefined }),
      }).catch(e => console.error("Backend logout failed for", email, e));
    });

    if (user?.email && !accounts.some(a => a.username === user.email)) {
      logoutPromises.push(
        fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, session_id: currentSessionId || undefined }),
        }).catch(e => console.error("Backend logout failed for", user.email, e))
      );
    }

    // Also try to revoke current session explicitly via the revoke endpoint
    if (currentSessionId) {
      try {
        await revokeSession(currentSessionId);
      } catch { /* best-effort */ }
    }

    try {
      await Promise.all(logoutPromises);
    } catch (e) {
      console.error("Failed to complete some backend logouts", e);
    }

    clearSessionId();
    sessionStorage.clear();
    clearLocalStoragePreserveTheme();
    // Clear MSAL cache silently
    if (accounts.length > 0) {
      instance.setActiveAccount(null);
    }

    window.location.replace("/signout");
  };

  // ── Session timeout: 8-hour inactivity + 24-hour absolute token limit ──────
  useEffect(() => {
    if (!user) {
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
      return;
    }
    // ── TEST VALUES (restore for production) ──────────────────────────────────
    // Inactivity:  30 s of no mouse/keyboard → "Session Timed Out"
    // Token expiry: 2 min after login        → "Session Expired"
    const INACTIVITY_MS = 8 * 60 * 60 * 1000;   // TODO: restore to 8  * 60 * 60 * 1000  (8 hours)
    const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // TODO: restore to 24 * 60 * 60 * 1000 (24 hours)
    // Seed timestamps on first login
    if (!sessionStorage.getItem("session_login_at")) {
      sessionStorage.setItem("session_login_at", Date.now().toString());
    }
    sessionStorage.setItem("session_last_activity", Date.now().toString());
    // Track user activity
    const onActivity = () =>
      sessionStorage.setItem("session_last_activity", Date.now().toString());
    const events = ["mousemove", "mousedown", "keypress", "scroll", "touchstart", "click"];
    events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    // Periodic expiry check — 5 s during testing (restore to 60_000 for production)
    sessionTimerRef.current = setInterval(() => {
      const now = Date.now();
      const loginAt = parseInt(sessionStorage.getItem("session_login_at") || "0", 10);
      const lastActivity = parseInt(sessionStorage.getItem("session_last_activity") || "0", 10);
      if (loginAt > 0 && now - loginAt >= TOKEN_EXPIRY_MS) {
        expireSessionRef.current("token_expiry");
      } else if (lastActivity > 0 && now - lastActivity >= INACTIVITY_MS) {
        expireSessionRef.current("inactivity");
      }
    }, 60_000);
    return () => {
      events.forEach(ev => window.removeEventListener(ev, onActivity));
      if (sessionTimerRef.current) {
        clearInterval(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, [user]);

  const mainName = path.length ? path[0].name : undefined;
  const accent = (mainName && MAIN_ACCENTS[mainName]) || MAIN_ACCENTS["Insurance"];
  const canUpload = !!current && (current.upload || current.month_driven);
  const showToolbar = view === "explorer" && !!current && children.length > 0;
  // List view is available when we're inside a vessel (path depth >= 2: main + vessel)
  const isAtVesselLevel = view === "explorer" && path.length >= 2 && current?.kind !== "main";
  const vesselNode = path.length >= 2 ? path[1] : null;
  // Show a neutral loading screen while MSAL is handling any interaction
  // or when we are in the process of auto-authenticating a cached account.
  // This prevents the login page from briefly flashing before moving to the home page.
  // Once an auth/backend error is known, stop spinning and fall through to the
  // login page so the error banner is actually visible instead of spinning forever.
  const isMsalActive =
    accounts.length > 0 && !user && !authError && window.location.pathname !== "/signout";

  if (authError) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#fbf5ee]">
        <div className="w-full max-w-md bg-white border border-rose-200 rounded-2xl p-8 shadow-lg text-center">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 font-bold text-xl">!</div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">Authentication Error</h3>
          <p className="text-sm text-rose-600 bg-rose-50/50 border border-rose-100 rounded-xl p-4 mb-6 text-left font-mono break-all whitespace-pre-wrap">
            {authError}
          </p>
          <div className="space-y-2">
            <button
              onClick={() => {
                setAuthError(null);
                loadTop();
              }}
              className="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition cursor-pointer"
            >
              Retry Connection
            </button>
            <button
              onClick={handleSignOut}
              className="w-full py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold transition cursor-pointer"
            >
              Sign Out & Try Another Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (inProgress !== "none" || isMsalActive) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
          <p className="text-sm text-muted tracking-wide font-semibold">Signing in…</p>
        </div>
      </div>
    );
  }

  if (window.location.pathname === "/auth") {
    return <AuthCallback />;
  }

  if (window.location.pathname === "/signout") {
    const signoutParams = new URLSearchParams(window.location.search);
    const signoutReason = signoutParams.get("reason");
    return (
      <LoginPage
        onAuthenticated={setUser}
        signedOut
        sessionExpiredFromSignout={signoutReason === "expired" ? "token_expiry" : undefined}
        onSignBackIn={() => {
          window.location.href = "/";
        }}
      />
    );
  }
  // Session expired — show inline without a URL redirect
  if (sessionExpiredReason) {
    return (
      <LoginPage
        onAuthenticated={(u) => { setUser(u); setSessionExpiredReason(null); }}
        sessionExpired={sessionExpiredReason}
        onSignBackIn={() => setSessionExpiredReason(null)}
      />
    );
  }

  if (!user) {
    return (
      <LoginPage
        onAuthenticated={(u) => {
          setUser(u);
          setApiEmail(u.email);
        }}
        authError={authError}
      />
    );
  }



  return (
    <div className="dms-app-bg flex h-screen overflow-hidden">
      <Sidebar
        mains={mains}
        view={view}
        selectedMainId={path[0]?.id ?? null}
        userDisplayName={user.display_name}
        userPhotoBase64={profilePhoto}
        onSelectMain={openMain}
        onDashboard={goDashboard}
        onVessels={goVessels}
        onNewVessel={() => setShowModal(true)}
        onSignOut={handleSignOut}
        onGlobalSignOut={handleGlobalSignOut}
        onProfile={goProfile}
        onViewFullPhoto={() => setShowFullPhoto(true)}
        onArchive={() => navigateTo("archive", [])}
        onRecycleBin={() => navigateTo("recycle_bin", [])}
        isAdmin={ADMIN_EMAILS.includes(user.email.toLowerCase())}
        onApprovals={goApprovals}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onCollapse={() => setSidebarCollapsed(true)}
        onExpand={() => setSidebarCollapsed(false)}
      />

      <main className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Unified Global Navbar */}
        <div className="dms-top-chrome relative z-30 flex items-center justify-between border-b border-border dms-page-px py-2">
          {/* Left: Mobile hamburger menu and brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth > 1024) {
                  setSidebarCollapsed(false);
                  return;
                }
                setSidebarOpen(true);
              }}
              className="lg:hidden dms-touch-btn rounded-lg text-fg hover:bg-surface2 transition"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="flex items-center gap-2 lg:hidden">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
                <Anchor className="h-3.5 w-3.5" strokeWidth={2} />
              </span>
              <span className="text-sm font-semibold text-fg truncate">Nissen DMS</span>
            </span>
          </div>

          {/* Center/Left (on Desktop): Search Bar (if applicable) */}
          <div className="flex-1 flex items-center justify-start gap-4 ml-2 lg:ml-0">
            {view !== "settings" && view !== "approvals" && view !== "profile" && view !== "dashboard" && (
              <SearchBar
                onNavigate={navigateToResult}
                vessels={vessels}
                vesselId={selectedVesselId}
                onVesselChange={(vesselId) =>
                  setSelectedVesselByPage((prev) => ({ ...prev, [pageKey]: vesselId }))
                }
                query={searchQuery}
                onQueryChange={(query) =>
                  setSearchQueryByPage((prev) => ({ ...prev, [pageKey]: query }))
                }
              />
            )}
          </div>

          {/* Right: Notification Bell */}
          <div className="flex items-center gap-3">
            <NotificationBell
              notifications={notifications}
              readIds={readNotificationIds}
              onMarkAllAsRead={handleMarkAllNotificationsRead}
              onNotificationClick={handleNotificationClick}
            />
          </div>
        </div>

        {view === "settings" ? (
          <SettingsPage
            onBack={() => setView("profile")}
            onSelectThemeSettings={() => setView("appearance")}
          />
        ) : view === "appearance" ? (
          <ThemeSettings onBack={() => setView("settings")} />
        ) : view === "approvals" ? (
          <Approvals
            actingEmail={user.email}
            isAdmin={ADMIN_EMAILS.includes(user.email.toLowerCase())}
            initialSelectedId={selectedApprovalId}
            initialTab={selectedApprovalTab}
            onClearInitial={() => {
              setSelectedApprovalId(null);
              setSelectedApprovalTab(undefined);
            }}
          />
        ) : view === "profile" ? (
          <ProfilePage
            mains={mains}
            userEmail={user.email}
            onBack={() => setView("explorer")}
            onDashboard={goDashboard}
            onSignOut={handleSignOut}
            onGlobalSignOut={handleGlobalSignOut}
            onSettings={goSettings}
            onPhotoUpdate={setProfilePhoto}
          />
        ) : view === "vessels" ? (
          <>
            <header className="dms-top-chrome border-b border-border dms-page-px py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-fg">Vessels</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Manage all vessels and update details from one place.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (!selectedVesselObj) return;
                      setVesselToUpdate(selectedVesselObj);
                      setShowUpdateModal(true);
                    }}
                    disabled={!selectedVesselObj}
                    className="dms-touch-btn inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <Ship className="h-4 w-4 shrink-0" />
                    <span className="dms-action-btn-text">Update Vessel</span>
                  </button>
                  <button
                    onClick={() => setShowModal(true)}
                    className="dms-touch-btn inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="dms-action-btn-text">New Vessel</span>
                  </button>
                </div>
              </div>
            </header>
            <div className="dms-page-bg flex-1 overflow-y-auto dms-page-px dms-page-py">
              {vessels.length === 0 ? (
                <div className="dms-card rounded-2xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
                  No vessels yet. Create one to provision its folder structure.
                </div>
              ) : (
                <div className="dms-card overflow-hidden rounded-2xl">
                  <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    Click any vessel row to open the main folder page.
                  </div>
                  <ul className="divide-y divide-border">
                    {vessels.map((v) => {
                      return (
                        <li key={v.id} className="bg-transparent">
                          <button
                            onClick={() => {
                              setSelectedVesselByPage((prev) => ({
                                ...prev,
                                [pageKey]: v.id,
                              }));
                              openVesselFromVesselsView(v);
                            }}
                            className="group flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-hover cursor-pointer select-none focus:outline-none"
                            title={`Open ${v.name}`}
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                              <Ship className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base font-semibold text-fg">{v.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-muted">
                                IMO {v.imo ?? "—"}
                                {v.hull_number ? ` · Hull ${v.hull_number}` : ""}
                                {v.shipyard ? ` · ${v.shipyard}` : ""}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </>
        ) : view === "dashboard" ? (
          <>
            <header className="dms-top-chrome border-b border-border dms-page-px py-5">
              <h2 className="text-xl font-semibold text-fg">Dashboard</h2>
              <p className="mt-0.5 text-sm text-muted">
                Fleet overview · shared SharePoint Embedded container
              </p>
            </header>
            <div className="dms-page-bg flex-1 overflow-y-auto dms-page-px dms-page-py">
              <Dashboard
                vessels={vessels}
                mains={mains}
                stats={stats}
                onOpenMain={openMain}
                onOpenVessel={openVesselFromDashboard}
                onNewVessel={() => setShowModal(true)}
              />
            </div>
          </>
        ) : view === "recycle_bin" ? (() => {
          // Sort recycle bin nodes
          const sortedDeleted = [...deletedNodes].sort((a, b) => {
            let cmp = 0;
            if (recycleSortKey === "name") {
              cmp = a.name.localeCompare(b.name);
            } else if (recycleSortKey === "deleted_at") {
              cmp = (a.deleted_at ?? "").localeCompare(b.deleted_at ?? "");
            } else if (recycleSortKey === "size") {
              cmp = (a.size ?? 0) - (b.size ?? 0);
            } else if (recycleSortKey === "modified") {
              cmp = (a.modified ?? "").localeCompare(b.modified ?? "");
            }
            return recycleSortDir === "desc" ? -cmp : cmp;
          });

          const handleRecycleSort = (key: typeof recycleSortKey) => {
            if (recycleSortKey === key) {
              setRecycleSortDir(d => d === "asc" ? "desc" : "asc");
            } else {
              setRecycleSortKey(key);
              setRecycleSortDir("desc");
            }
          };

          const SortIcon = ({ col }: { col: typeof recycleSortKey }) =>
            recycleSortKey === col ? (
              recycleSortDir === "desc"
                ? <ChevronDown className="inline h-3.5 w-3.5 ml-0.5 text-brand-600" />
                : <ChevronUp className="inline h-3.5 w-3.5 ml-0.5 text-brand-600" />
            ) : null;

          const fmtBytes = (n?: number | null) => {
            if (n == null) return "—";
            if (n < 1024) return `${n} B`;
            if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
            return `${(n / (1024 * 1024)).toFixed(1)} MB`;
          };

          const fmtDate = (s?: string | null) => {
            if (!s) return "—";
            try {
              return new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
            } catch { return s; }
          };

          return (
            <>
              {/* Header */}
              <div className="dms-top-chrome border-b border-slate-200 bg-white">
                <div className="dms-page-px py-3 flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 mr-1">
                    <Trash2 className="h-5 w-5 text-rose-500" />
                    <span className="font-semibold text-slate-800 text-base">Recycle Bin</span>
                  </div>

                  {/* Toolbar buttons */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {/* Sort dropdown */}
                    <div className="relative group">
                      <button className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition">
                        <ChevronUp className="h-3.5 w-3.5" />
                        Sort
                        <ChevronDown className="h-3 w-3 text-slate-400" />
                      </button>
                      <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 hidden group-hover:block">
                        {(["name", "deleted_at", "size", "modified"] as const).map(k => (
                          <button
                            key={k}
                            onClick={() => handleRecycleSort(k)}
                            className={`w-full text-left px-3 py-2 text-xs transition hover:bg-slate-50 flex items-center justify-between ${recycleSortKey === k ? "font-semibold text-brand-600" : "text-slate-700"}`}
                          >
                            {{ name: "Name", deleted_at: "Date Deleted", size: "Size", modified: "Date Modified" }[k]}
                            {recycleSortKey === k && (
                              recycleSortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* View toggle */}
                    <div className="flex items-center gap-0.5 border border-slate-200 rounded px-1 py-1">
                      <button
                        onClick={() => setRecycleLayout("list")}
                        className={`rounded p-1 transition ${recycleLayout === "list" ? "bg-brand-100 text-brand-600" : "text-slate-400 hover:text-slate-600"}`}
                        title="List view"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setRecycleLayout("grid")}
                        className={`rounded p-1 transition ${recycleLayout === "grid" ? "bg-brand-100 text-brand-600" : "text-slate-400 hover:text-slate-600"}`}
                        title="Grid view"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
                          <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
                        </svg>
                      </button>
                    </div>

                    <div className="w-px h-6 bg-slate-200 mx-1" />

                    {/* Empty Recycle Bin */}
                    <button
                      onClick={() => {
                        if (deletedNodes.length > 0 && window.confirm(`Permanently delete all ${deletedNodes.length} item(s)? This cannot be undone.`)) {
                          void handleEmptyRecycleBin();
                        }
                      }}
                      disabled={deletedNodes.length === 0}
                      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      Empty Recycle Bin
                    </button>

                    {/* Restore all items */}
                    <button
                      onClick={() => {
                        if (deletedNodes.length > 0) void handleRestoreAll();
                      }}
                      disabled={deletedNodes.length === 0}
                      className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ArchiveRestore className="h-3.5 w-3.5 text-emerald-600" />
                      Restore all items
                    </button>
                  </div>

                  <div className="ml-auto text-xs text-slate-400">
                    {deletedNodes.length} item{deletedNodes.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto bg-white dms-page-px">
                {deletedNodes.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center py-28 text-center">
                    <Trash2 className="h-16 w-16 text-slate-200 mb-4" />
                    <h3 className="text-base font-semibold text-slate-600">Recycle Bin is empty</h3>
                    <p className="mt-1.5 text-sm text-slate-400">Items you delete will appear here before being permanently removed.</p>
                  </div>
                ) : recycleLayout === "list" ? (
                  /* ── LIST / TABLE VIEW ── */
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="w-8 px-3 py-2.5" />
                          <th
                            className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
                            onClick={() => handleRecycleSort("name")}
                          >
                            Name <SortIcon col="name" />
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            Original Location
                          </th>
                          <th
                            className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
                            onClick={() => handleRecycleSort("deleted_at")}
                          >
                            Date Deleted <SortIcon col="deleted_at" />
                          </th>
                          <th
                            className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
                            onClick={() => handleRecycleSort("size")}
                          >
                            Size <SortIcon col="size" />
                          </th>
                          <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                            Item Type
                          </th>
                          <th
                            className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-800 select-none whitespace-nowrap"
                            onClick={() => handleRecycleSort("modified")}
                          >
                            Date Modified <SortIcon col="modified" />
                          </th>
                          <th className="px-3 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedDeleted.map((n) => {
                          const isFile = n.kind === "file";
                          const iconInfo = iconFor(n);
                          const IconComponent = isFile ? (iconInfo?.Icon || FileText) : FolderOpen;
                          const iconCls = isFile ? (iconInfo?.cls || "text-slate-400") : "text-amber-500";
                          return (
                            <tr
                              key={n.id}
                              className="group hover:bg-slate-50 transition cursor-default"
                            >
                              <td className="px-3 py-2.5">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 group-hover:bg-white transition">
                                  <IconComponent className={`h-4 w-4 ${iconCls}`} />
                                </div>
                              </td>
                              <td className="px-3 py-2.5 font-medium text-slate-800 max-w-[200px]">
                                <span className="block truncate" title={n.name}>{n.name}</span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 max-w-[220px]">
                                <span className="block truncate text-xs" title={n.original_path || "—"}>{n.original_path || "—"}</span>
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                                {fmtDate(n.deleted_at)}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 text-xs text-right whitespace-nowrap">
                                {fmtBytes(n.size)}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                                {n.item_type ?? (isFile ? "File" : "File folder")}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                                {fmtDate(n.modified)}
                              </td>
                              <td className="px-3 py-2.5">
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Restore "${n.name}" to its original location?`)) {
                                      handleRestoreSingleDeleted(n);
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
                                  title="Restore"
                                >
                                  <ArchiveRestore className="h-3 w-3" />
                                  Restore
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* ── GRID VIEW ── */
                  <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {sortedDeleted.map((n) => {
                      const isFile = n.kind === "file";
                      const iconInfo = iconFor(n);
                      const IconComponent = isFile ? (iconInfo?.Icon || FileText) : FolderOpen;
                      const iconCls = isFile ? (iconInfo?.cls || "text-slate-400") : "text-amber-500";
                      return (
                        <div
                          key={n.id}
                          className="group flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                              <IconComponent className={`h-5 w-5 ${iconCls}`} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-800" title={n.name}>{n.name}</p>
                              <p className="mt-0.5 text-[11px] text-slate-400">{n.item_type ?? (isFile ? "File" : "File folder")}</p>
                            </div>
                          </div>
                          <div className="space-y-1 text-[11px] text-slate-500">
                            <div><span className="font-medium text-slate-600">Location:</span> <span className="truncate block" title={n.original_path}>{n.original_path || "—"}</span></div>
                            <div className="flex justify-between">
                              <span><span className="font-medium text-slate-600">Deleted:</span> {fmtDate(n.deleted_at)}</span>
                              <span>{fmtBytes(n.size)}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (window.confirm(`Restore "${n.name}"?`)) {
                                handleRestoreSingleDeleted(n);
                              }
                            }}
                            className="mt-1 w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition"
                          >
                            <ArchiveRestore className="h-3.5 w-3.5" />
                            Restore
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          );
        })()
        : view === "archive" ? (
          (() => {
            const firstArchivedIdx = path.findIndex(crumb => archivedFolderIds.has(crumb.id) || archivedNodes.some(n => n.id === crumb.id));
            const isBrowsingArchivedSubfolder = current && firstArchivedIdx !== -1;
            
            return (
              <>
                <div className="border-b border-border bg-surface dms-page-px py-3 flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted min-w-0">
                    <button 
                      onClick={() => { 
                        if (firstArchivedIdx !== -1) {
                          navigateTo("archive", path.slice(0, firstArchivedIdx)); 
                        } else {
                          navigateTo("archive", []);
                        }
                      }} 
                      className="hover:text-fg transition shrink-0"
                    >
                      Archived Folders
                    </button>
                    {isBrowsingArchivedSubfolder && (() => {
                      const archivedCrumbs = path.slice(firstArchivedIdx);
                      return archivedCrumbs.map((crumb, idx) => (
                        <span key={crumb.id} className="flex items-center gap-2 min-w-0">
                          <ChevronRight className="h-3 w-3 text-muted shrink-0" />
                          <button 
                            onClick={() => navigateTo("archive", path.slice(0, firstArchivedIdx + idx + 1))} 
                            className={"hover:text-fg transition truncate " + (idx === archivedCrumbs.length - 1 ? "text-fg font-semibold cursor-default" : "")}
                          >
                            {crumb.name}
                          </button>
                        </span>
                      ));
                    })()}
                  </div>
                  <button
                    onClick={() => setView("explorer")}
                    className="shrink-0 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-fg hover:bg-surface2 transition"
                  >
                    Back to Explorer
                  </button>
                </div>

                {isBrowsingArchivedSubfolder ? (
                  <>
                    <header className="dms-page-header flex items-center justify-between gap-4 border-b border-slate-100 bg-white dms-page-px py-4">
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-2 truncate text-xl font-semibold text-slate-800">
                          <Archive className="h-5 w-5 text-amber-600 animate-pulse" />
                          <span className="truncate">{current?.name}</span> <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">Archived</span>
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {children.filter((c) => c.kind !== "file").length} folder(s) · {children.filter((c) => c.kind === "file").length} file(s) inside this archive
                        </p>
                      </div>
                    </header>
                    <div className="flex-1 overflow-y-auto bg-slate-50 dms-page-px dms-page-py">
                      {loadingChildren ? (
                        <FolderGridSkeleton />
                      ) : children.length === 0 ? (
                        <EmptyFolder canUpload={false} />
                      ) : (
                        <FolderGrid
                          items={children}
                          accent={accent}
                          layout={layout}
                          onOpen={(n) => navigateTo("archive", [...path, { id: n.id, name: n.name }])}
                          onPreview={setPreview}
                          onDelete={handleDelete}
                          onDownload={handleDownload}
                          onRenew={handleRenew}
                          isMainFolder={path.length === 1 && view === "archive"}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <header className="dms-page-header flex items-center justify-between gap-4 border-b border-slate-100 bg-white dms-page-px py-4">
                      <div className="min-w-0">
                        <h2 className="flex items-center gap-2 truncate text-xl font-semibold text-slate-800">
                          <Archive className="h-5 w-5 text-amber-600" />
                          Archived Folders
                        </h2>
                        <p className="mt-0.5 text-sm text-slate-500">
                          Showing {archivedNodes.length} folder(s) archived from this container
                        </p>
                      </div>
                    </header>

                    <div className="flex-1 overflow-y-auto bg-slate-50 dms-page-px dms-page-py">
                      {archivedNodes.length === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center py-20 text-center">
                          <Archive className="h-10 w-10 text-slate-300 mb-3" />
                          <h3 className="text-sm font-semibold text-slate-700">No archived items</h3>
                          <p className="mt-1 text-xs text-slate-500">Folders and files you archive will show up here.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {archivedNodes.map((f) => (
                            <div 
                              key={f.id} 
                              className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow-md relative cursor-pointer"
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest(".action-menu")) return;
                                if (f.kind === "file") {
                                  setPreview(f);
                                } else {
                                  navigateTo("archive", [...path, { id: f.id, name: f.name }]);
                                }
                              }}
                            >
                              <div className="flex items-start gap-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                                  {f.kind === "file" ? (
                                    <FileText className="h-5 w-5 text-slate-500" />
                                  ) : (
                                    <Archive className="h-5 w-5 text-amber-600" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h3 className="truncate text-sm font-semibold text-slate-800" title={f.name}>
                                    {f.name}
                                  </h3>
                                  <p className="mt-0.5 text-xs text-slate-400 font-medium">
                                    {f.kind === "file" ? "Archived File" : "Archived Folder"}
                                  </p>
                                  {f.main_folder && (
                                    <p className="mt-1 text-[11px] font-semibold text-amber-600 uppercase tracking-wider bg-amber-50/50 px-2 py-0.5 rounded border border-amber-100 inline-block">
                                      {f.main_folder}
                                    </p>
                                  )}
                                  {f.original_path && (
                                    <p className="mt-1.5 text-[11px] text-slate-500 truncate" title={f.original_path}>
                                      Path: {f.original_path}
                                    </p>
                                  )}
                                </div>
                                <div className="relative action-menu" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={(e) => handleArchiveMenuToggle(e, f.id)}
                                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                                    title="More actions"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            );
          })()
        ) : (
          <>
            <div className="dms-top-chrome border-b border-border dms-page-px py-3">
              <Breadcrumb crumbs={crumbs} onNavigate={crumbTo} />
            </div>

            <header className="dms-page-header dms-top-chrome flex items-center justify-between gap-4 border-b border-border dms-page-px py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 truncate text-xl font-semibold text-fg">
                  {current ? (
                    <>
                      {(() => {
                        const { Icon, cls } = iconFor(current);
                        return <Icon className={"h-5 w-5 shrink-0 " + cls} />;
                      })()}
                      <span className="truncate">{current.name}</span>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                      All Main Folders
                    </>
                  )}
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {current
                    ? current.month_driven
                      ? `Upload here — auto-filed into monthly folders · ${displayed.filter((c) => c.kind !== "file").length} folders · ${displayed.filter((c) => c.kind === "file").length} files`
                      : `${displayed.filter((c) => c.kind !== "file").length} folders · ${displayed.filter((c) => c.kind === "file").length} files`
                    : "Shared container · pick a main folder to browse"}
                </p>
              </div>
              <div className="header-actions flex flex-wrap items-center gap-2">
                {/* Folder / List view toggle — shown when inside a vessel */}
                {isAtVesselLevel && (
                  <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface text-xs font-semibold">
                    <button
                      onClick={() => setListViewMode(false)}
                      className={"flex items-center gap-1.5 px-3 py-1.5 transition " + (!listViewMode ? "bg-primary/10 text-primary" : "text-muted hover:bg-bg")}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
                        <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
                      </svg>
                      Folder view
                    </button>
                    <button
                      onClick={() => setListViewMode(true)}
                      className={"flex items-center gap-1.5 border-l border-border px-3 py-1.5 transition " + (listViewMode ? "bg-primary/10 text-primary" : "text-muted hover:bg-bg")}
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" />
                      </svg>
                      List view
                    </button>
                  </div>
                )}
                {(current?.kind === "main" || !current) && (
                  <button
                    onClick={() => setShowModal(true)}
                    className="dms-touch-btn inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-500 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span className="dms-action-btn-text">New Vessel</span>
                  </button>
                )}
                {current && (
                  <>
                    <button
                      onClick={() => { setArchiveSelectIds(new Set()); setShowArchiveSelectModal(true); }}
                      className="dms-touch-btn inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-amber-500 cursor-pointer"
                    >
                      <Archive className="h-4 w-4 shrink-0" />
                      <span className="dms-action-btn-text">Archive</span>
                    </button>
                    {current?.month_driven && (
                      <button
                        onClick={() => { setCreateFolderName(""); setCreateFolderError(null); setShowCreateFolderModal(true); }}
                        className="dms-touch-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-violet-700 ring-1 ring-violet-200 bg-violet-50 hover:bg-violet-100 transition shadow-sm"
                      >
                        <FolderPlus className="h-4 w-4 shrink-0" />
                        <span className="dms-action-btn-text">Create Folder</span>
                      </button>
                    )}
                    {current?.kind !== "main" && children.some((c) => c.kind !== "file") && (
                      <button
                        onClick={() => { setDeleteFolderIds(new Set()); setShowDeleteModal(true); }}
                        className="dms-touch-btn inline-flex items-center gap-1.5 rounded-lg bg-slate-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-500 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4 shrink-0" />
                        <span className="dms-action-btn-text">Delete Folders</span>
                      </button>
                    )}
                  </>
                )}
                {children.some((c) => c.kind === "file") && (
                  <button
                    onClick={() => { setDeleteFileIds(new Set()); setShowDeleteFilesModal(true); }}
                    className="dms-touch-btn inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 transition shadow-sm cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span className="dms-action-btn-text">Delete Files</span>
                  </button>
                )}
                {canUpload && (
                  <UploadControl node={current!} onUpload={handleUpload} variant="primary" />
                )}
              </div>
            </header>

            <div className="dms-page-bg flex-1 overflow-y-auto dms-page-px dms-page-py">
              {listViewMode && isAtVesselLevel && vesselNode ? (
                <VesselListView vesselId={vesselNode.id} vesselName={vesselNode.name} />
              ) : (
                <>
                  {showToolbar && (
                    <FolderToolbar
                      query={fQuery}
                      setQuery={setFQuery}
                      typeKey={typeKey}
                      setTypeKey={setTypeKey}
                      sort={sortKey}
                      setSort={setSortKey}
                      view={layout}
                      setView={setLayout}
                    />
                  )}
                  {loadingChildren ? (
                    <FolderGridSkeleton />
                  ) : displayed.length === 0 ? (
                    children.length > 0 ? (
                      <p className="dms-card w-full rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
                        Nothing matches your filter.
                      </p>
                    ) : current?.month_driven ? (
                      <p className="dms-card w-full rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
                        No month folders yet — upload a document to auto-create one, or click <strong className="text-primary">Create Folder</strong> to add one manually.
                      </p>
                    ) : (
                      <EmptyFolder canUpload={canUpload} />
                    )
                  ) : (
                    <FolderGrid
                      items={displayed}
                      accent={accent}
                      layout={layout}
                      onOpen={openChild}
                      onPreview={setPreview}
                      onDelete={handleDelete}
                      onDownload={handleDownload}
                      onRenew={handleRenew}
                      isMainFolder={path.length === 1 && view === "explorer"}
                    />
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      {showModal && (
        <CreateVesselModal onClose={() => setShowModal(false)} onCreate={handleCreate} vessels={vessels} />
      )}
      {showUpdateModal && (
        <UpdateVesselModal
          vessel={vesselToUpdate}
          onClose={() => { setShowUpdateModal(false); setVesselToUpdate(null); }}
          onUpdate={handleUpdateVessel}
          vessels={vessels}
        />
      )}
      <PreviewDrawer file={preview} onClose={() => setPreview(null)} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <ApprovalResultPopup items={pendingApprovalRequests} onDismiss={handleDismissApprovalResult} />
      <DuplicateFilePopup
        info={duplicateFileInfo}
        onDismiss={() => setDuplicateFileInfo(null)}
        onNavigate={(folderId, folderPath) => {
          if (folderId === "recycle_bin") {
            setView("recycle_bin");
            setPath([]);
          } else {
            search(duplicateFileInfo?.filename || "").then((results) => {
              const match = results.find(
                (r) => r.id === folderId || (r.name.toLowerCase() === duplicateFileInfo?.filename.toLowerCase() && r.kind === "file")
              );
              if (match) {
                navigateToResult(match);
              } else {
                setView("explorer");
                setPath([{ id: folderId, name: folderPath.split("/").pop() || "Folder" }]);
              }
            }).catch(() => {
              setView("explorer");
              setPath([{ id: folderId, name: folderPath.split("/").pop() || "Folder" }]);
            });
          }
        }}
      />

      {/* ── Archive Folders Modal (two-column) ───────────────────────── */}
      {showArchiveSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowArchiveSelectModal(false)} />
          <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
                  <Archive className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Archive Items</h2>
                  <p className="text-xs text-slate-500">Hide folders and files — restore anytime from the archived list</p>
                </div>
              </div>
              <button onClick={() => setShowArchiveSelectModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Two-column body */}
            <div className="flex divide-x divide-slate-100">

              {/* Left: Select items to archive */}
              <div className="flex-1 p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Select to Archive</p>
                <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-1.5">
                  {children.filter((c) => !archivedFolderIds.has(c.id)).length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">No items available.</p>
                  ) : (
                    children.filter((c) => !archivedFolderIds.has(c.id)).map((f) => (
                      <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white transition">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded accent-amber-600"
                          checked={archiveSelectIds.has(f.id)}
                          onChange={(e) => {
                            const next = new Set(archiveSelectIds);
                            if (e.target.checked) next.add(f.id); else next.delete(f.id);
                            setArchiveSelectIds(next);
                          }}
                        />
                        {f.kind === "file" ? (
                          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                        )}
                        <span className="text-sm font-medium text-slate-700 truncate">{f.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Right: Already archived */}
              <div className="w-64 shrink-0 bg-white p-4 pr-12 min-h-[180px]">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-600 px-1">
                  Archived ({archivedNodes.length})
                </p>
                <div className="max-h-64 space-y-0.5 overflow-y-auto pr-2">
                  {archivedNodes.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">No archived items yet.</p>
                  ) : (
                    archivedNodes.map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-amber-50/50 transition">
                        <span 
                          onClick={() => {
                            if (f.kind === "file") {
                              setPreview(f);
                            } else {
                              setShowArchiveSelectModal(false);
                              setView("archive");
                              navigateTo("archive", [...path, { id: f.id, name: f.name }]);
                            }
                          }}
                          className="min-w-0 flex-1 text-xs font-semibold text-slate-700 cursor-pointer hover:text-amber-800 hover:underline transition flex items-center gap-1.5"
                          title={f.kind === "file" ? `Click to preview file ${f.name}` : `Click to view archived folder ${f.name}`}
                        >
                          {f.kind === "file" ? (
                            <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          ) : (
                            <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}
                          <span className="truncate flex-1">
                            {f.name} {f.main_folder ? `(${f.main_folder})` : ""}
                          </span>
                        </span>
                        <button
                          onClick={(e) => handleArchiveMenuToggle(e, f.id)}
                          className="rounded-lg p-1 text-slate-600 hover:bg-white hover:text-slate-800 transition shrink-0"
                          title="More actions"
                        >
                          <MoreVertical className="h-4 w-4 text-slate-600" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col gap-2 border-t border-slate-100 px-6 py-4">
              <button
                onClick={() => {
                  setShowArchiveSelectModal(false);
                  setView("archive");
                }}
                className="w-full rounded-lg bg-amber-50 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 flex items-center justify-center gap-1.5"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Go to Archive Folder Page
              </button>
              <div className="flex gap-3">
                <button onClick={() => setShowArchiveSelectModal(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const selected = children.filter((c) => archiveSelectIds.has(c.id));
                    const includesFile = selected.some((n) => n.kind === "file");
                    const isAdminUser = ADMIN_EMAILS.includes((user?.email || "").toLowerCase());
                    if (includesFile && !isAdminUser) {
                      setShowArchiveSelectModal(false);
                      setShowArchiveReasonModal(true);
                    } else {
                      void handleBulkFolderArchive();
                    }
                  }}
                  disabled={archiveSelectIds.size === 0}
                  className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Archive {archiveSelectIds.size > 0 ? `(${archiveSelectIds.size})` : ""} Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive File Request Modal (non-admin, mandatory reason) ──── */}
      {showArchiveReasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => { setShowArchiveReasonModal(false); setArchiveReason(""); }}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                <Archive className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">Archive File Request</h3>
              </div>
            </div>

            <p className="mb-2 text-xs text-slate-500">
              Please provide the reason for archiving this file. This reason will be included in the
              approval request for the SPE Admin to review.
            </p>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Reason for Archiving <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Explain why this file should be archived…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setShowArchiveReasonModal(false); setArchiveReason(""); }}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => archiveReason.trim() && void handleBulkFolderArchive(archiveReason.trim())}
                disabled={!archiveReason.trim()}
                className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recycle Bin Selection Modal ───────────────────────── */}
      {showRecycleSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowRecycleSelectModal(false)} />
          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50">
                  <Trash2 className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Manage Recycle Bin Items</h2>
                  <p className="text-xs text-slate-500">Select folders and files to restore or permanently delete</p>
                </div>
              </div>
              <button onClick={() => setShowRecycleSelectModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Deleted Items ({deletedNodes.length})
                </p>
                {deletedNodes.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRecycleSelectIds(new Set(deletedNodes.map(n => n.id)))}
                      className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-xs text-slate-300">|</span>
                    <button
                      onClick={() => setRecycleSelectIds(new Set())}
                      className="text-xs font-semibold text-slate-500 hover:underline cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                )}
              </div>

              <div className="max-h-80 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
                {deletedNodes.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-400">No items in Recycle Bin.</p>
                ) : (
                  deletedNodes.map((n) => {
                    const isFile = n.kind === "file";
                    const iconInfo = iconFor(n);
                    const IconComponent = isFile ? (iconInfo?.Icon || FileText) : Trash2;
                    const iconColorClass = isFile ? (iconInfo?.cls || "text-slate-500") : "text-rose-600";
                    return (
                      <label key={n.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white transition">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded accent-rose-600 cursor-pointer"
                          checked={recycleSelectIds.has(n.id)}
                          onChange={(e) => {
                            const next = new Set(recycleSelectIds);
                            if (e.target.checked) next.add(n.id); else next.delete(n.id);
                            setRecycleSelectIds(next);
                          }}
                        />
                        <IconComponent className={`h-4 w-4 shrink-0 ${iconColorClass}`} />
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-semibold text-slate-700 block truncate">{n.name}</span>
                          <span className="text-[10px] text-slate-400 font-medium block">
                            {isFile ? "File" : "Folder"} {n.main_folder ? `· ${n.main_folder}` : ""}
                          </span>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-6 py-4 bg-slate-50 flex gap-3">
              <button 
                onClick={() => setShowRecycleSelectModal(false)}
                className="flex-1 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkRestoreDeleted}
                disabled={recycleSelectIds.size === 0}
                className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="h-4 w-4" />
                Restore {recycleSelectIds.size > 0 ? `(${recycleSelectIds.size})` : ""}
              </button>
              <button
                onClick={handleBulkPermanentDelete}
                disabled={recycleSelectIds.size === 0}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Hard Delete {recycleSelectIds.size > 0 ? `(${recycleSelectIds.size})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Recycle Hard Delete Confirmation Modal ────────── */}
      {showBulkDeleteRecycleModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowBulkDeleteRecycleModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50">
                <ShieldOff className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Hard Delete Selected Items?</h2>
                <p className="text-xs text-rose-500 font-medium">This action cannot be undone!</p>
              </div>
            </div>
            <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50/30 p-4 text-xs text-slate-600 leading-relaxed">
              You are about to permanently delete <strong className="text-rose-700">{recycleSelectIds.size} selected item(s)</strong> using SharePoint Embedded Hard Delete API. They will be removed forever and cannot be restored from the Recycle Bin.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowBulkDeleteRecycleModal(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                Cancel
              </button>
              <button
                onClick={executeBulkPermanentDelete}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 cursor-pointer"
              >
                Hard Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Folders Modal ──────────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowDeleteModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Move Folders to Recycle Bin</h2>
                <p className="text-xs text-slate-500">Selected folders will be moved to the Recycle Bin</p>
              </div>
            </div>
            <div className="mb-4 max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
              {children.filter((c) => c.kind !== "file" && !archivedFolderIds.has(c.id)).length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No folders available.</p>
              ) : (
                children.filter((c) => c.kind !== "file" && !archivedFolderIds.has(c.id)).map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-white">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-rose-600"
                      checked={deleteFolderIds.has(f.id)}
                      onChange={(e) => {
                        const next = new Set(deleteFolderIds);
                        if (e.target.checked) next.add(f.id); else next.delete(f.id);
                        setDeleteFolderIds(next);
                      }}
                    />
                    <span className="text-sm font-medium text-slate-700">{f.name}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => handleBulkFolderDelete()}
                disabled={deleteFolderIds.size === 0}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Move {deleteFolderIds.size > 0 ? `(${deleteFolderIds.size})` : ""} to Recycle Bin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Files Modal ──────────────────────────────────────────── */}
      {showDeleteFilesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowDeleteFilesModal(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Move Files to Recycle Bin</h2>
                <p className="text-xs text-slate-500">Selected files will be moved to the Recycle Bin</p>
              </div>
            </div>
            <div className="mb-4 min-h-[150px] max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2 pr-6">
              {children.filter((c) => c.kind === "file").length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No files available in this folder.</p>
              ) : (
                children.filter((c) => c.kind === "file").map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-white transition">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-rose-600"
                      checked={deleteFileIds.has(f.id)}
                      onChange={(e) => {
                        const next = new Set(deleteFileIds);
                        if (e.target.checked) next.add(f.id); else next.delete(f.id);
                        setDeleteFileIds(next);
                      }}
                    />
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-700 truncate">{f.name}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteFilesModal(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => handleBulkFileDelete()}
                disabled={deleteFileIds.size === 0}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Move {deleteFileIds.size > 0 ? `(${deleteFileIds.size})` : ""} Selected to Recycle Bin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Upload Success Modal ──────────────────────────────────────────── */}
      {showUploadSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl z-10 border border-slate-100">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <Clock3 className="h-6 w-6 text-amber-600 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Awaiting Reviewer Approval</h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Your documents have been uploaded successfully and are awaiting approval from the authorized reviewer. The documents will be available after approval.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowUploadSuccessModal(false)}
                className="w-full px-6 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white transition shadow-sm cursor-pointer text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Archive Panel ──────────────────────────────────────────────────────── */}
      {showArchivePanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowArchivePanel(false)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
                <Archive className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-800">Archived Items</h2>
                <p className="text-xs text-slate-500">Archived folders and files — restore to bring them back</p>
              </div>
            </div>
            <div className="mb-4 min-h-[150px] max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2 pr-6">
              {archivedNodes.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No archived items.</p>
              ) : (
                archivedNodes.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition relative">
                    <span 
                      onClick={() => {
                        if (f.kind === "file") {
                          setPreview(f);
                        } else {
                          setShowArchivePanel(false);
                          setView("archive");
                          navigateTo("archive", [...path, { id: f.id, name: f.name }]);
                        }
                      }}
                      className="min-w-0 flex-1 text-xs font-semibold text-slate-700 cursor-pointer hover:text-amber-800 hover:underline transition flex items-center gap-1.5"
                      title={f.kind === "file" ? `Click to preview file ${f.name}` : `Click to view archived folder ${f.name}`}
                    >
                      {f.kind === "file" ? (
                        <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="truncate flex-1">
                        {f.name} {f.main_folder ? `(${f.main_folder})` : ""}
                      </span>
                    </span>
                    <button
                      onClick={(e) => handleArchiveMenuToggle(e, f.id)}
                      className="rounded-lg p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition shrink-0"
                      title="More actions"
                    >
                      <MoreVertical className="h-4 w-4 text-slate-600" />
                    </button>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setShowArchivePanel(false)}
              className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Close
            </button>
          </div>
        </div>
      )}

      {/* ── Create Folder Modal ───────────────────────────────────────────── */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setShowCreateFolderModal(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
                  <FolderPlus className="h-4 w-4 text-violet-600" />
                </div>
                <h2 className="text-base font-semibold text-slate-800">Create Month Folder</h2>
              </div>
              <button
                onClick={() => setShowCreateFolderModal(false)}
                className="rounded-lg p-1 hover:bg-slate-100 transition"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Creates a folder inside <strong className="text-slate-700">{current?.name}</strong> with the standard category sub-folders. You can then upload files directly into it.
            </p>

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Folder Name
            </label>
            <input
              autoFocus
              type="text"
              value={createFolderName}
              onChange={(e) => { setCreateFolderName(e.target.value); setCreateFolderError(null); }}
              onKeyDown={(e) => e.key === "Enter" && void handleCreateFolder()}
              placeholder="e.g. July 2026 or 2026-07"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />

            {createFolderName && (
              (() => {
                const cleaned = cleanFolderName(createFolderName);
                const hasSpecial = createFolderName !== cleaned;
                const hasLetters = /[a-zA-Z]/.test(cleaned);
                
                if (hasSpecial || !hasLetters) {
                  return (
                    <p className="mt-2 text-[11px] leading-relaxed text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                      {hasSpecial && (
                        <span>⚠️ <strong>Note:</strong> Special characters (like quotes, equals, dashes) will be ignored.</span>
                      )}
                      {!hasLetters && (
                        <span className="text-red-650 font-medium">⚠️ <strong>Validation:</strong> Please include alphabetic characters (letters) for the month name.</span>
                      )}
                      {cleaned && hasLetters && (
                        <span>Folder will be created as: <strong className="text-amber-900 font-semibold">"{cleaned}"</strong></span>
                      )}
                    </p>
                  );
                }
                return null;
              })()
            )}


            {createFolderError && (
              <p className="mt-2 text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {createFolderError}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowCreateFolderModal(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateFolder()}
                disabled={!createFolderName.trim() || createFolderLoading}
                className="flex-1 rounded-lg bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {createFolderLoading ? "Creating…" : "Create Folder"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete File Confirmation Modal ──────────────────────── */}
      {deleteFileNode && deleteFileNode.kind === "file" && !ADMIN_EMAILS.includes((user?.email || "").toLowerCase()) ? (
        // Non-admin deleting a file: mandatory reason, becomes a pending approval request.
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setDeleteFileNode(null); setDeleteReason(""); }} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">Delete File Request</h3>
              </div>
            </div>

            <div className="mb-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-700" title={deleteFileNode.name}>
                {deleteFileNode.name}
              </p>
            </div>

            <p className="mb-2 text-xs text-slate-500">
              Please provide the reason for deleting this file. This reason will be included in the
              approval request for the SPE Admin to review.
            </p>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Reason for Deletion <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Explain why this file should be deleted…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setDeleteFileNode(null); setDeleteReason(""); }}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteReason.trim() && void confirmDeleteFile(deleteReason.trim())}
                disabled={!deleteReason.trim()}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      ) : deleteFileNode && (
        // Admin, or a folder: existing immediate-confirmation flow, unchanged.
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteFileNode(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5">
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">Move file to Recycle Bin?</h3>
                <p className="text-xs text-slate-500">This file can be restored later</p>
              </div>
            </div>

            {/* File name */}
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-700" title={deleteFileNode.name}>
                {deleteFileNode.name}
              </p>
            </div>

            {/* Warning */}
            <p className="mt-3 text-xs text-slate-500">
              The file will be hidden from the active explorer. You can access it in the Recycle Bin.
            </p>

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteFileNode(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmDeleteFile()}
                className="flex-1 rounded-lg bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 transition cursor-pointer"
              >
                Move to Recycle Bin
              </button>
            </div>
          </div>
        </div>
      )}



      {/* ── Restore Confirmation Modal ───────────────────────── */}
      {restoreConfirmNode && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setRestoreConfirmNode(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-1 flex items-center gap-2">
              <ArchiveRestore className="h-5 w-5 text-brand-600" />
              <h3 className="text-base font-semibold text-slate-800">Restore folder?</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium">&ldquo;{restoreConfirmNode.name}&rdquo;</span> will be visible again in the main folder view.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setRestoreConfirmNode(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleFolderArchive(restoreConfirmNode);
                  setRestoreConfirmNode(null);
                  setShowArchiveSelectModal(false);
                  setShowArchivePanel(false);
                }}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 transition"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {activeMenuFolderId && (
        (() => {
          const f = archivedNodes.find(n => n.id === activeMenuFolderId);
          if (!f) return null;
          return createPortal(
            <>
              {/* Overlay backdrop to close the menu on click */}
              <div 
                className="fixed inset-0 z-[9998]" 
                onClick={() => setActiveMenuFolderId(null)} 
              />
              <div
                style={{
                  position: "fixed",
                  ...(archiveMenuDropPos.flipped
                    ? { bottom: archiveMenuDropPos.bottom }
                    : { top: archiveMenuDropPos.top }),
                  right: archiveMenuDropPos.right,
                  zIndex: 9999,
                  maxHeight: "280px",
                  overflowY: "auto",
                }}
                className="w-40 rounded-lg border border-slate-200 bg-white p-1 shadow-xl flex flex-col gap-0.5"
              >
                <button
                  onClick={() => {
                    setActiveMenuFolderId(null);
                    navigateTo("archive", [...path, { id: f.id, name: f.name }]);
                    setShowArchiveSelectModal(false);
                    setShowArchivePanel(false);
                  }}
                  className="flex items-center gap-2 w-full rounded px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Eye className="h-3.5 w-3.5 text-slate-400" />
                  View
                </button>
                <button
                  onClick={() => {
                    setActiveMenuFolderId(null);
                    void downloadFolderRecursively(f);
                  }}
                  className="flex items-center gap-2 w-full rounded px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  <Download className="h-3.5 w-3.5 text-slate-400" />
                  Download
                </button>
                <button
                  onClick={() => {
                    setActiveMenuFolderId(null);
                    setRestoreConfirmNode(f);
                  }}
                  className="flex items-center gap-2 w-full border-t border-slate-100 mt-0.5 pt-1.5 rounded-b px-2.5 py-2 text-left text-xs font-semibold text-brand-600 hover:bg-brand-50 transition"
                >
                  <ArchiveRestore className="h-3.5 w-3.5 text-brand-500" />
                  Restore
                </button>
              </div>
            </>,
            document.body
          );
        })()
      )}

      {/* Full Photo Modal overlay */}
      {showFullPhoto && profilePhoto && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer"
          onClick={() => setShowFullPhoto(false)}
        >
          <div 
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img 
              src={profilePhoto} 
              alt="Full Profile" 
              className="max-h-[80vh] max-w-[80vw] rounded-xl object-contain" 
            />
            <div className="mt-3 flex items-center justify-between px-2">
              <span className="text-xs text-white/60 font-medium">{user?.display_name} &middot; Profile Photo</span>
              <button 
                onClick={() => setShowFullPhoto(false)}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function FolderGrid({
  items,
  accent,
  layout,
  onOpen,
  onPreview,
  onDelete,
  onDownload,
  onRenew,
  isMainFolder = false,
}: {
  items: FolderNode[];
  accent: (typeof MAIN_ACCENTS)[string];
  layout: ViewKey;
  onOpen: (n: FolderNode) => void;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
  onDownload: (n: FolderNode) => void;
  onRenew: (n: FolderNode, f: File) => void;
  isMainFolder?: boolean;
}) {
  const [showAllVessels, setShowAllVessels] = useState(false);
  const folders = items.filter((i) => i.kind !== "file");
  const files = items.filter((i) => i.kind === "file");

  const commonFolder = isMainFolder ? folders.find((f) => f.name.toLowerCase().includes("common")) : null;
  const vesselFolders = isMainFolder 
    ? folders.filter((f) => !f.name.toLowerCase().includes("common"))
    : folders;

  const displayedVessels = isMainFolder && !showAllVessels 
    ? vesselFolders.slice(0, 4) 
    : vesselFolders;

  return (
    <div className="w-full space-y-7">
      {/* If isMainFolder, we separate common from vessel folders */}
      {isMainFolder ? (
        <>
          {commonFolder && (
            <div className="mb-7">
              <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                Common Agreements / Documents
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-1 lg:col-span-1">
                  <FolderCard key={commonFolder.id} node={commonFolder} accent={accent} onOpen={onOpen} isBig={true} />
                </div>
              </div>
            </div>
          )}

          {vesselFolders.length > 0 && (
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                Vessels
              </p>
              {layout === "grid" ? (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {displayedVessels.map((n) => (
                      <FolderCard key={n.id} node={n} accent={accent} onOpen={onOpen} />
                    ))}
                  </div>
                  {vesselFolders.length > 4 && (
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => setShowAllVessels(!showAllVessels)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
                      >
                        {showAllVessels ? (
                          <>
                            Show Less <ChevronUp className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            More Vessels ({vesselFolders.length - 4}) <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {vesselFolders.map((n) => (
                    <FolderRow key={n.id} node={n} accent={accent} onOpen={onOpen} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Standard rendering */
        folders.length > 0 &&
        (layout === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((n) => (
              <FolderCard key={n.id} node={n} accent={accent} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {folders.map((n) => (
              <FolderRow key={n.id} node={n} accent={accent} onOpen={onOpen} />
            ))}
          </div>
        ))
      )}

      {files.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-subtle">
            Files
          </p>
          {layout === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((f) => (
                <FileCard key={f.id} file={f} onPreview={onPreview} onDelete={onDelete} onDownload={onDownload} onRenew={onRenew} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {files.map((f) => (
                <FileRow key={f.id} file={f} onPreview={onPreview} onDelete={onDelete} onDownload={onDownload} onRenew={onRenew} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function folderSubtitle(node: FolderNode): string {
  return node.kind === "ship"
    ? "Vessel"
    : node.month_driven
      ? "Auto-month folder"
      : node.kind === "month"
        ? "Monthly"
        : node.name.toLowerCase().includes("common")
          ? "Common"
          : "Folder";
}

function FolderCard({
  node,
  accent,
  onOpen,
  isBig = false,
}: {
  node: FolderNode;
  accent: (typeof MAIN_ACCENTS)[string];
  onOpen: (n: FolderNode) => void;
  isBig?: boolean;
}) {
  const { Icon, cls } = iconFor(node);
  return (
    <button
      onClick={() => onOpen(node)}
      className={`dms-card dms-card-hover group flex w-full items-center gap-4 rounded-2xl text-left cursor-pointer ${isBig ? "p-6" : "p-5"}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-xl transition ${isBig ? "h-16 w-16" : "h-12 w-12"} ${accent.chip}`}>
        <Icon className={`${isBig ? "h-7 w-7" : "h-6 w-6"} ${cls}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-semibold text-fg wrap-break-word whitespace-normal ${isBig ? "text-lg" : "text-base"}`} title={node.name}>{node.name}</span>
        <span className="mt-0.5 block text-sm text-muted">{folderSubtitle(node)}</span>
      </span>
      {node.month_driven && (
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent ring-1 ring-accent/20">
          auto-month
        </span>
      )}
      <ChevronRight className="h-5 w-5 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

function FolderRow({
  node,
  accent,
  onOpen,
}: {
  node: FolderNode;
  accent: (typeof MAIN_ACCENTS)[string];
  onOpen: (n: FolderNode) => void;
}) {
  const { Icon, cls } = iconFor(node);
  return (
    <button
      onClick={() => onOpen(node)}
      className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-bg cursor-pointer"
    >
      <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " + accent.chip}>
        <Icon className={"h-4 w-4 " + cls} />
      </span>
      <span className="flex-1 text-base font-medium text-fg wrap-break-word whitespace-normal" title={node.name}>{node.name}</span>
      <span className="text-sm text-subtle">{folderSubtitle(node)}</span>
      <ChevronRight className="h-4 w-4 text-subtle group-hover:text-primary" />
    </button>
  );
}
function FileActions({
  file,
  onPreview,
  onDelete,
  onDownload,
  onRenew,
}: {
  file: FolderNode;
  onPreview?: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
  onDownload?: (n: FolderNode) => void;
  onRenew?: (n: FolderNode, f: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, bottom: 0, right: 0, flipped: false });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renewInputRef = useRef<HTMLInputElement>(null);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const MENU_H = 180; // adjusted menu height to fit Preview option
      const spaceBelow = window.innerHeight - rect.bottom;
      const flipped = spaceBelow < MENU_H && rect.top > MENU_H;
      setDropPos({
        top: flipped ? 0 : rect.bottom + 4,
        bottom: flipped ? window.innerHeight - rect.top + 4 : 0,
        right: window.innerWidth - rect.right,
        flipped,
      });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const isFile = file.kind === "file";

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      {isFile && onRenew && (
        <input
          ref={renewInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onRenew(file, f);
            e.target.value = "";
            setOpen(false);
          }}
        />
      )}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
        title="More actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            ...(dropPos.flipped
              ? { bottom: dropPos.bottom }
              : { top: dropPos.top }),
            right: dropPos.right,
            zIndex: 9999,
            maxHeight: "280px",
            overflowY: "auto",
          }}
          className="w-36 rounded-lg border border-slate-200 bg-white p-1 shadow-xl flex flex-col gap-0.5"
        >
          {isFile && onPreview && (
            <button
              onClick={() => { onPreview(file); setOpen(false); }}
              className="flex items-center gap-2 w-full rounded px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              Preview
            </button>
          )}
          {isFile && onDownload && (
            <button
              onClick={() => { onDownload(file); setOpen(false); }}
              className="flex items-center gap-2 w-full rounded px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-400" />
              Download
            </button>
          )}
          {isFile && onRenew && (
            <button
              onClick={() => renewInputRef.current?.click()}
              className="flex items-center gap-2 w-full rounded px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              Renew
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(file); setOpen(false); }}
            className={`flex items-center gap-2 w-full text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 transition cursor-pointer px-2.5 py-2 ${
              isFile ? "border-t border-slate-100 mt-0.5 pt-1.5 rounded-b" : "rounded"
            }`}
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

function FileCard({
  file,
  onPreview,
  onDelete,
  onDownload,
  onRenew,
}: {
  file: FolderNode;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
  onDownload: (n: FolderNode) => void;
  onRenew: (n: FolderNode, f: File) => void;
}) {
  const meta = fileMeta(file.ext);
  const sub = [formatSize(file.size), formatDate(file.modified)].filter(Boolean).join(" · ");
  return (
    <div
      className="dms-card dms-card-hover group flex items-center gap-3 rounded-xl p-4"
    >
      <span className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + meta.chip}>
        <meta.Icon className={"h-5 w-5 " + meta.cls} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{file.name}</span>
        <span className="mt-0.5 block truncate text-xs text-subtle">{sub || meta.label}</span>
      </span>
      <div className="lg:opacity-0 lg:group-hover:opacity-100 transition shrink-0">
        <FileActions file={file} onPreview={onPreview} onDelete={onDelete} onDownload={onDownload} onRenew={onRenew} />
      </div>
    </div>
  );
}

function FileRow({
  file,
  onPreview,
  onDelete,
  onDownload,
  onRenew,
}: {
  file: FolderNode;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
  onDownload: (n: FolderNode) => void;
  onRenew: (n: FolderNode, f: File) => void;
}) {
  const meta = fileMeta(file.ext);
  return (
    <div
      className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-bg"
    >
      <meta.Icon className={"h-4 w-4 shrink-0 " + meta.cls} />
      <span className="flex-1 truncate text-sm text-fg">{file.name}</span>
      <span className={"rounded px-1.5 py-0.5 text-[10px] font-medium " + meta.chip}>{meta.label}</span>
      <span className="hidden w-16 text-right text-xs text-subtle sm:block">{formatSize(file.size)}</span>
      <span className="hidden w-24 text-right text-xs text-subtle md:block">{formatDate(file.modified)}</span>
      <div className="lg:opacity-0 lg:group-hover:opacity-100 transition shrink-0">
        <FileActions file={file} onPreview={onPreview} onDelete={onDelete} onDownload={onDownload} onRenew={onRenew} />
      </div>
    </div>
  );
}

function EmptyFolder({ canUpload }: { canUpload: boolean }) {
  return (
    <div className="dms-card mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-border-strong p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <FolderOpen className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-fg">This folder is empty</h3>
      <p className="mt-1 text-sm text-muted">
        {canUpload
          ? "Use the Upload button in the top-right to add a document."
          : "Open a sub-folder to continue."}
      </p>
    </div>
  );
}
