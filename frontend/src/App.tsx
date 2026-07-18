import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronDown, ChevronUp, Menu, MoreVertical, Download, RotateCcw, FolderOpen, FolderPlus, Trash2, X, Archive, ArchiveRestore, Eye, FileText, ShieldOff, Plus, Ship } from "lucide-react";
import { ApprovalResultPopup, type ApprovalResultItem } from "./components/ApprovalResultPopup";
import { DuplicateFilePopup, type DuplicateFileInfo } from "./components/DuplicateFilePopup";
import { listMyApprovals } from "./api";

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
  uploadFile,
  fileContentUrl,
  deleteFolder,
  getDeletedNodes,
  restoreDeletedItem,
  permanentDeleteItem,
  search,
  updateVessel,
  type FolderNode,
  type SearchResult,
  type Stats,
  type Vessel,
} from "./api";
import { useMsal } from "@azure/msal-react";
import { LoginPage } from "./components/Login";

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
import { Approvals } from "./components/Approvals";
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
  return (
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
    fallback
  );
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

function sortItems(items: FolderNode[], sort: SortKey): FolderNode[] {
  const folders = items.filter((i) => i.kind !== "file");
  const files = items.filter((i) => i.kind === "file");
  
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
      const dateA = parseMonthFolderDate(a.name);
      const dateB = parseMonthFolderDate(b.name);
      if (dateA && dateB) {
        return dateB.getTime() - dateA.getTime();
      }
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      // Fallback for non-month folders: sort by modified date if available, else alphabetically
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
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showFullPhoto, setShowFullPhoto] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { instance, accounts, inProgress } = useMsal();
  const [stats, setStats] = useState<Stats | null>(null);
  const [view, setView] = useState<"dashboard" | "explorer" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      if (v === "explorer" || v === "profile" || v === "dashboard" || v === "archive" || v === "recycle_bin" || v === "approvals" || v === "settings") {
        return v as "dashboard" | "explorer" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings";
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


  // In-folder toolbar state
  const [fQuery, setFQuery] = useState("");
  const [typeKey, setTypeKey] = useState<TypeKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [layout, setLayout] = useState<ViewKey>("grid");

  const loadTop = useCallback(async () => {
    const [m, v, s, archIds, archNodes, delNodes] = await Promise.all([
      getMains(),
      listVessels(),
      getStats(),
      getArchivedIds(),
      getArchivedNodes(),
      getDeletedNodes()
    ]);
    setMains(m);
    setVessels(v);
    setStats(s);
    setArchivedFolderIds(new Set(archIds));
    setArchivedNodes(archNodes);
    setDeletedNodes(delNodes);
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
      setUser({
        display_name: "Test User",
        email: "testuser@example.com",
      });
      setApiEmail("testuser@example.com");
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
            setUser({
              display_name:
                payload.display_name || result.account.name || result.account.username,
              email: payload.email || result.account.username,
            });
          } else {
            setAuthError(
              "Signed in with Microsoft, but the server rejected the session. Please try again."
            );
          }
        } catch (e) {
          if (active) {
            console.error("Backend login sync failed after redirect", e);
            setAuthError("Could not reach the server to complete sign-in. Please try again.");
          }
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
              setUser({
                display_name: payload.display_name || account.name || account.username,
                email,
              });
              setApiEmail(email);
              setAuthError(null);
            } else {
              const body = await res.text();
              console.error("Backend validation failed during auto-login:", res.status, body);
              setAuthError(`Signed in with Microsoft, but the server rejected the session (Code ${res.status}). Details: ${body}`);
            }
          } catch (e) {
            console.error("Backend login sync failed during auto-login", e);
            setAuthError(`Could not reach the server to complete sign-in. Connection failed: ${e instanceof Error ? e.message : String(e)}`);
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

  // Polling for user's pending/decided approvals
  useEffect(() => {
    if (!user) return;
    
    const checkApprovals = async () => {
      try {
        const myApprovals = await listMyApprovals();
        const decided = myApprovals.filter(a => a.status === "approved" || a.status === "rejected");
        
        const seenKey = `seen_approvals_${user.email}`;
        const seenIds = JSON.parse(localStorage.getItem(seenKey) || "[]") as string[];
        
        const newDecided = decided.filter(a => !seenIds.includes(a.id));
        if (newDecided.length > 0) {
          const itemsToShow: ApprovalResultItem[] = newDecided.map(a => ({
            id: a.id,
            filename: a.filename,
            status: a.status as "approved" | "rejected",
            decidedAt: a.decided_at,
            rejectionReason: a.rejection_reason,
            finalPath: a.final_path,
          }));
          
          setPendingApprovalRequests((prev) => {
            const next = [...prev];
            itemsToShow.forEach(item => {
              if (!next.some(x => x.id === item.id)) {
                next.push(item);
                setTimeout(() => {
                  handleDismissApprovalResult(item.id);
                }, 9000);
              }
            });
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to poll my approvals", err);
      }
    };

    checkApprovals();
    const interval = setInterval(checkApprovals, 2000);

    return () => clearInterval(interval);
  }, [user, handleDismissApprovalResult]);


  useEffect(() => {
    if (user && window.location.pathname !== "/homepage") {
      captureDiagnostics("before homepage replaceState");
      window.history.replaceState({}, "", "/homepage");
      captureDiagnostics("after homepage replaceState");
    }
  }, [user]);

  const signOutRef = useRef<() => void>(() => { });
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireSessionRef = useRef<(reason: "inactivity" | "token_expiry") => void>(() => { });

  const navigateTo = useCallback((newView: "dashboard" | "explorer" | "profile" | "archive" | "recycle_bin" | "approvals" | "settings", newPath: PathEntry[]) => {
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

      if (state.view === "dashboard" || state.view === "explorer" || state.view === "profile" || state.view === "archive" || state.view === "recycle_bin") {
        setView(state.view as "dashboard" | "explorer" | "profile" | "archive" | "recycle_bin");
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
    loadTop();
  }, [loadTop]);

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

  const activeVesselObj = useMemo(() => {
    if (path.length > 1) {
      const vName = path[1].name;
      return vessels.find((v) => v.name.toLowerCase() === vName.toLowerCase()) || null;
    }
    if (selectedVesselId) {
      return vessels.find((v) => v.id === selectedVesselId) || null;
    }
    return null;
  }, [path, vessels, selectedVesselId]);

  const loadCurrent = useCallback(async () => {
    if (!currentId) {
      setCurrent(null);
      setChildren(mains);
      return;
    }
    setLoadingChildren(true);
    try {
      const [node, kids] = await Promise.all([
        getFolder(currentId),
        getChildren(currentId),
      ]);
      setCurrent(node);
      setChildren(kids);
    } catch (e) {
      // If the folder can't be loaded (e.g. stale ID after rename/delete),
      // keep children empty and show a toast rather than silently doing nothing.
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Could not load folder contents.";
      const id = Date.now();
      setToasts((prev) => [
        ...prev,
        { id, status: "failed" as const, title: "Folder load error", detail },
      ]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
    } finally {
      setLoadingChildren(false);
    }
  }, [currentId, mains]);

  useEffect(() => {
    if (view === "explorer" || view === "archive") loadCurrent();
  }, [view, currentId, loadCurrent]);

  useEffect(() => {
    if (view === "recycle_bin") {
      getDeletedNodes().then(setDeletedNodes).catch(console.error);
    }
  }, [view]);

  useEffect(() => {
    setFQuery(""); // reset in-folder filter when navigating
  }, [currentId]);

  // ----- navigation -----
  const goDashboard = () => navigateTo("dashboard", []);
  const goProfile = () => navigateTo("profile", []);
  const goApprovals = () => navigateTo("approvals", []);
  const goSettings = () => navigateTo("settings", []);
  const openMain = (node: FolderNode) => navigateTo("explorer", [{ id: node.id, name: node.name }]);
  const openChild = (node: FolderNode) => {
    if (node.kind === "file") return;
    navigateTo("explorer", [...path, { id: node.id, name: node.name }]);
  };
  const crumbTo = (i: number) => navigateTo("explorer", i === 0 ? [] : path.slice(0, i));

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

  // ----- displayed items (vessel scope + filter + sort) -----
  const displayed = useMemo(() => {
    let items = children.filter((c) => !archivedFolderIds.has(c.id));
    if (current?.kind === "main" && selectedVesselName)
      items = items.filter((c) => c.kind !== "ship" || c.name === selectedVesselName);
    const q = fQuery.trim().toLowerCase();
    if (q) items = items.filter((c) => c.name.toLowerCase().includes(q));
    items = items.filter((c) => matchesType(c, typeKey));
    return sortItems(items, sortKey);
  }, [children, current, selectedVesselName, fQuery, typeKey, sortKey, archivedFolderIds]);

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
    await Promise.all([
      loadCurrent(),
      getStats().then(setStats),
      getDeletedNodes().then(setDeletedNodes),
      getArchivedNodes().then(setArchivedNodes),
    ]);
  }, [loadCurrent]);

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
              ? "Awaiting admin approval"
              : "Upload failed";
        upsertToast({
          id,
          status: final.status,
          title,
          detail: final.status === "done" && final.destination ? formatUploadSuccessDetail(final.destination) : final.destination,
          detectedMonth: final.detected_month,
        });
        // Small delay: SharePoint may take a moment to index a newly uploaded file
        // before it appears in a list_children response.
        if (final.status === "done") await sleep(1200);
        await refreshAfterMutation();
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
    async () => {
      if (!deleteFileNode) return;
      const node = deleteFileNode;
      setDeleteFileNode(null);
      const id = Date.now() + Math.floor(Math.random() * 1000);
      try {
        if (node.kind === "file") {
          await deleteFile(node.id, user?.email);
        } else {
          await deleteFolder(node.id, user?.email, node.name);
        }
        await refreshAfterMutation();
        upsertToast({ id, status: "done", title: "Moved to Recycle Bin", detail: node.name });
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
          title: final.status === "done" ? "Document renewed" : "Renew failed",
          detail: final.destination,
          detectedMonth: final.detected_month,
        });
        await refreshAfterMutation();
        setTimeout(() => dismissToast(id), 6000);
      } catch (e) {
        upsertToast({ id, status: "failed", title: "Renew failed", detail: errDetail(e, node.name) });
        setTimeout(() => dismissToast(id), 6000);
      }
    },
    [current, refreshAfterMutation]
  );

  const handleBulkFolderArchive = useCallback(async () => {
    if (archiveSelectIds.size === 0) return;
    const nodesToArchive = children.filter((c) => archiveSelectIds.has(c.id));
    
    try {
      await Promise.all(
        nodesToArchive.map((n) =>
          archiveItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined)
        )
      );
    } catch (e) {
      console.error("Failed to archive items in DB:", e);
    }

    setArchivedFolderIds((prev) => {
      const next = new Set(prev);
      archiveSelectIds.forEach((id) => next.add(id));
      return next;
    });
    setArchivedNodes((prev) => {
      const existingIds = new Set(prev.map((n) => n.id));
      return [...prev, ...nodesToArchive.filter((n) => !existingIds.has(n.id))];
    });
    setShowArchiveSelectModal(false);
    setArchiveSelectIds(new Set());
    // Log activity
    if (user?.email) {
      nodesToArchive.forEach((n) =>
        logActivity(user.email, n.kind === "file" ? "archive_file" : "archive_folder", `Archived ${n.kind === "file" ? "file" : "folder"}: ${n.name}`)
      );
    }
    // Success toast
    const tid = Date.now() + Math.floor(Math.random() * 1000);
    upsertToast({
      id: tid,
      status: "done",
      title: `${nodesToArchive.length} item${nodesToArchive.length !== 1 ? "s" : ""} archived`,
      detail: nodesToArchive.map((n) => n.name).join(", "),
    });
    setTimeout(() => dismissToast(tid), 4000);
  }, [archiveSelectIds, children, user]);

  const handleFolderArchive = useCallback(async (node: FolderNode) => {
    const isRestoring = archivedNodes.some((n) => n.id === node.id);
    
    try {
      if (isRestoring) {
        await restoreItem(node.id, user?.email || undefined);
      } else {
        await archiveItem(node.id, node.kind === "file" ? "file" : "folder", user?.email || undefined);
      }
    } catch (e) {
      console.error("Failed to archive/restore item in DB:", e);
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
    const tid2 = Date.now() + Math.floor(Math.random() * 1000);
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
      for (const fid of idsToDelete) {
        await deleteFolder(fid, user?.email, nameMap.get(fid));
      }
      await refreshAfterMutation();
      upsertToast({ id, status: "done", title: "Folders soft-deleted", detail: `${idsToDelete.length} folder(s) moved to Recycle Bin` });
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
      for (const fid of idsToDelete) {
        await deleteFile(fid, user?.email);
      }
      await refreshAfterMutation();
      upsertToast({ id, status: "done", title: "Files soft-deleted", detail: `${idsToDelete.length} file(s) moved to Recycle Bin` });
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
      for (const n of selected) {
        await restoreDeletedItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined);
      }
      await refreshAfterMutation();
      upsertToast({ id, status: "done", title: "Selected items restored", detail: "Items are visible again" });
      setRecycleSelectIds(new Set());
      setShowRecycleSelectModal(false);
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Restore failed", detail: errDetail(e, "") });
    }
    setTimeout(() => dismissToast(id), 5000);
  }, [recycleSelectIds, deletedNodes, refreshAfterMutation, user]);

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
      for (const n of selected) {
        await permanentDeleteItem(n.id, n.kind === "file" ? "file" : "folder", user?.email || undefined);
      }
      await refreshAfterMutation();
      upsertToast({ id, status: "done", title: "Selected items permanently deleted", detail: "Items removed forever" });
      setRecycleSelectIds(new Set());
      setShowRecycleSelectModal(false);
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Delete failed", detail: errDetail(e, "") });
    }
    setTimeout(() => dismissToast(id), 5000);
  }, [recycleSelectIds, deletedNodes, refreshAfterMutation, user]);

  const handleCreate = async (data: import("./api").VesselInput) => {
    await createVessel(data);
    await loadTop();
    setView("explorer");
  };

  const handleUpdateVessel = async (vesselId: string, data: Partial<import("./api").VesselInput>) => {
    await updateVessel(vesselId, data);
    
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
      await createSubfolder(current.id, cleaned, user?.email);
      setShowCreateFolderModal(false);
      setCreateFolderName("");
      await loadCurrent();
    } catch (e) {
      setCreateFolderError(
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to create folder. Please try again."
      );
    } finally {
      setCreateFolderLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email }),
      });
    } catch (e) {
      console.error("Backend logout call failed", e);
    }

    sessionStorage.clear();
    localStorage.clear();

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
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user?.email }),
    }).catch(() => { });
    // MSAL silent cache clear
    const account = accounts[0] || instance.getActiveAccount();
    if (account) {
      instance.setActiveAccount(null);
    }
    sessionStorage.clear();
    localStorage.clear();
    setUser(null);
    setSessionExpiredReason(reason);
  };

  /** Sign out of ALL Microsoft accounts on this device (ends every SSO session) */
  const handleGlobalSignOut = async () => {
    // Send a backend logout request for every account cached in MSAL
    const logoutPromises = accounts.map(account => {
      const email = account.username;
      return fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }).catch(e => console.error("Backend logout failed for", email, e));
    });

    if (user?.email && !accounts.some(a => a.username === user.email)) {
      logoutPromises.push(
        fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email }),
        }).catch(e => console.error("Backend logout failed for", user.email, e))
      );
    }

    try {
      await Promise.all(logoutPromises);
    } catch (e) {
      console.error("Failed to complete some backend logouts", e);
    }

    sessionStorage.clear();
    localStorage.clear();
    // Clear MSAL cache silently — onRedirectNavigate returning false stops
    // the browser from navigating to Microsoft's logout page while still
    // removing the account from the local token cache.
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
    return (
      <LoginPage
        onAuthenticated={setUser}
        signedOut
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
        onNewVessel={() => setShowModal(true)}
        onSignOut={handleSignOut}
        onGlobalSignOut={handleGlobalSignOut}
        onProfile={goProfile}
        onViewFullPhoto={() => setShowFullPhoto(true)}
        onArchive={() => navigateTo("archive", [])}
        onRecycleBin={() => navigateTo("recycle_bin", [])}
        isAdmin={ADMIN_EMAILS.includes(user.email.toLowerCase())}
        onApprovals={goApprovals}
        onSettings={goSettings}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <main className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* ── Mobile top bar (hamburger + logo) ── */}
        <div className="dms-mobile-topbar border-b border-border">
          <button
            onClick={() => setSidebarOpen(true)}
            className="dms-touch-btn rounded-lg text-fg hover:bg-surface2 transition"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-fg truncate">Nissen DMS</span>
        </div>

        {/* Top bar: vessel switcher + global search */}
        {view !== "settings" && view !== "approvals" && view !== "profile" && (
          <div className="dms-top-chrome relative z-30 flex items-center gap-3 border-b border-border dms-page-px py-2.5">
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
          </div>
        )}

        {view === "settings" ? (
          <ThemeSettings />
        ) : view === "approvals" ? (
          <Approvals actingEmail={user.email} />
        ) : view === "profile" ? (
          <ProfilePage
            mains={mains}
            userEmail={user.email}
            onBack={() => setView("explorer")}
            onDashboard={goDashboard}
            onSignOut={handleSignOut}
            onGlobalSignOut={handleGlobalSignOut}
            onPhotoUpdate={setProfilePhoto}
          />
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
                onNewVessel={() => setShowModal(true)}
              />
            </div>
          </>
        ) : view === "recycle_bin" ? (
          <>
            <header className="dms-page-header flex items-center justify-between gap-4 border-b border-slate-100 bg-white dms-page-px py-4">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 truncate text-xl font-semibold text-slate-800">
                  <Trash2 className="h-5 w-5 text-rose-600 animate-pulse" />
                  Recycle Bin
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Showing {deletedNodes.length} soft-deleted items
                </p>
              </div>
              <div className="header-actions flex flex-wrap gap-2">
                {deletedNodes.length > 0 && (
                  <button
                    onClick={() => {
                      setRecycleSelectIds(new Set());
                      setShowRecycleSelectModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500 transition cursor-pointer shadow-sm"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="dms-action-btn-text">Restore / Hard Delete</span>
                  </button>
                )}
                <button
                  onClick={() => setView("explorer")}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Back to Explorer
                </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-slate-50 dms-page-px dms-page-py">
              {deletedNodes.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center py-20 text-center">
                  <Trash2 className="h-10 w-10 text-slate-300 mb-3" />
                  <h3 className="text-sm font-semibold text-slate-700">Recycle Bin is empty</h3>
                  <p className="mt-1 text-xs text-slate-500">Folders and files you delete will show up here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {deletedNodes.map((n) => {
                    const isFile = n.kind === "file";
                    const iconInfo = iconFor(n);
                    const IconComponent = isFile ? (iconInfo?.Icon || FileText) : Trash2;
                    const iconColorClass = isFile ? (iconInfo?.cls || "text-slate-500") : "text-rose-600 font-semibold";
                    return (
                      <div 
                        key={n.id} 
                        onClick={() => {
                          setRecycleSelectIds(new Set([n.id]));
                          setShowRecycleSelectModal(true);
                        }}
                        className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md relative cursor-pointer"
                      >
                        <div className="flex items-start gap-4">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                            <IconComponent className={`h-5 w-5 ${iconColorClass}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-semibold text-slate-800" title={n.name}>
                              {n.name}
                            </h3>
                            <p className="mt-0.5 text-xs text-slate-400 font-medium">
                              {isFile ? "Soft-deleted File" : "Soft-deleted Folder"}
                            </p>
                            {n.main_folder && (
                              <p className="mt-1 text-[11px] font-semibold text-rose-500 uppercase tracking-wider bg-rose-50/50 px-2 py-0.5 rounded border border-rose-100 inline-block">
                                {n.main_folder}
                              </p>
                            )}
                            {n.original_path && (
                              <p className="mt-1.5 text-[11px] text-slate-500 truncate" title={n.original_path}>
                                Path: {n.original_path}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : view === "archive" ? (
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
                    {current?.kind === "main" && (
                      <button
                        onClick={() => { setVesselToUpdate(activeVesselObj); setShowUpdateModal(true); }}
                        className="dms-touch-btn inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 cursor-pointer"
                      >
                        <Ship className="h-4 w-4 shrink-0" />
                        <span className="dms-action-btn-text">Update Vessel</span>
                      </button>
                    )}
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
                  <p className="dms-card mx-auto max-w-5xl rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
                    Nothing matches your filter.
                  </p>
                ) : current?.month_driven ? (
                  <p className="dms-card mx-auto max-w-5xl rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
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
                  onClick={() => handleBulkFolderArchive()}
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
      {deleteFileNode && (
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
    <div className="mx-auto max-w-5xl space-y-6">
      {/* If isMainFolder, we separate common from vessel folders */}
      {isMainFolder ? (
        <>
          {commonFolder && (
            <div className="mb-6">
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                Common Agreements / Documents
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="sm:col-span-1 lg:col-span-1">
                  <FolderCard key={commonFolder.id} node={commonFolder} accent={accent} onOpen={onOpen} isBig={true} />
                </div>
              </div>
            </div>
          )}

          {vesselFolders.length > 0 && (
            <div>
              <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                Vessels
              </p>
              {layout === "grid" ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {displayedVessels.map((n) => (
                      <FolderCard key={n.id} node={n} accent={accent} onOpen={onOpen} />
                    ))}
                  </div>
                  {vesselFolders.length > 4 && (
                    <div className="mt-4 flex justify-center">
                      <button
                        onClick={() => setShowAllVessels(!showAllVessels)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
            Files
          </p>
          {layout === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      className={`dms-card dms-card-hover group flex w-full items-center gap-3 rounded-xl text-left ${isBig ? "p-5" : "p-4"}`}
    >
      <span className={`flex shrink-0 items-center justify-center rounded-xl transition ${isBig ? "h-14 w-14" : "h-11 w-11"} ${accent.chip}`}>
        <Icon className={`${isBig ? "h-6 w-6" : "h-5 w-5"} ${cls}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate font-semibold text-fg ${isBig ? "text-base" : "text-sm"}`}>{node.name}</span>
        <span className="mt-0.5 block text-xs text-muted">{folderSubtitle(node)}</span>
      </span>
      {node.month_driven && (
        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent ring-1 ring-accent/20">
          auto-month
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition group-hover:translate-x-0.5 group-hover:text-primary" />
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
      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-bg"
    >
      <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " + accent.chip}>
        <Icon className={"h-4 w-4 " + cls} />
      </span>
      <span className="flex-1 truncate text-sm font-medium text-fg">{node.name}</span>
      <span className="text-xs text-subtle">{folderSubtitle(node)}</span>
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

  void onPreview;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const MENU_H = 150; // estimated menu height for fallback
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
      onClick={() => onPreview(file)}
      className="dms-card dms-card-hover group flex cursor-pointer items-center gap-3 rounded-xl p-4"
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
      onClick={() => onPreview(file)}
      className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-bg"
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
