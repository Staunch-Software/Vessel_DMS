import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, MoreVertical, Download, RotateCcw, FolderOpen, FolderPlus, Trash2, X, Archive, ArchiveRestore } from "lucide-react";
import {
  createVessel,
  createSubfolder,
  deleteFile,
  getChildren,
  getFolder,
  getJob,
  getMains,
  getStats,
  listVessels,
  logActivity,
  monthUpload,
  setApiEmail,
  uploadFile,
  fileContentUrl,
  deleteFolder,
  type FolderNode,
  type SearchResult,
  type Stats,
  type Vessel,
} from "./api";
import { useMsal } from "@azure/msal-react";
import { LoginPage } from "./components/Login";
import { Sidebar } from "./components/Sidebar";
import { CreateVesselModal } from "./components/CreateVesselModal";
import { Breadcrumb, type Crumb } from "./components/Breadcrumb";
import { UploadControl } from "./components/UploadControl";
import { ToastStack, type ToastItem } from "./components/Toast";
import { Dashboard } from "./components/Dashboard";
import { SearchBar } from "./components/SearchBar";
import { VesselSwitcher } from "./components/VesselSwitcher";
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


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IMG = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"];

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
    return `file exists in folder '${leafFolder}' under main folder '${mainFolder}' and vessel '${vesselName}'`;
  }
  if (parts.length >= 2) {
    const mainFolder = parts[0];
    const leafFolder = parts[parts.length - 2];
    return `file exists in folder '${leafFolder}' under main folder '${mainFolder}'`;
  }
  return `file exists: ${dest}`;
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

function sortItems(items: FolderNode[], sort: SortKey): FolderNode[] {
  const folders = items.filter((i) => i.kind !== "file");
  const files = items.filter((i) => i.kind === "file");
  const byName = (a: FolderNode, b: FolderNode) => a.name.localeCompare(b.name);
  folders.sort(byName);
  if (sort === "name") files.sort(byName);
  else if (sort === "size") files.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  else files.sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""));
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
  const { instance, accounts, inProgress } = useMsal();
  const [stats, setStats] = useState<Stats | null>(null);

  const [view, setView] = useState<"dashboard" | "explorer" | "profile">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const v = params.get("view");
      if (v === "explorer" || v === "profile" || v === "dashboard") {
        return v;
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionExpiredReason, setSessionExpiredReason] = useState<"inactivity" | "token_expiry" | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createFolderName, setCreateFolderName] = useState("");
  const [createFolderLoading, setCreateFolderLoading] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const [archivedFolderIds, setArchivedFolderIds] = useState<Set<string>>(new Set());
  const [archivedNodes, setArchivedNodes] = useState<FolderNode[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showArchiveSelectModal, setShowArchiveSelectModal] = useState(false);
  const [showArchivePanel, setShowArchivePanel] = useState(false);
  const [restoreConfirmNode, setRestoreConfirmNode] = useState<FolderNode | null>(null);
  const [deleteFolderIds, setDeleteFolderIds] = useState<Set<string>>(new Set());
  const [archiveSelectIds, setArchiveSelectIds] = useState<Set<string>>(new Set());
  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);
  const [preview, setPreview] = useState<FolderNode | null>(null);

  // In-folder toolbar state
  const [fQuery, setFQuery] = useState("");
  const [typeKey, setTypeKey] = useState<TypeKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [layout, setLayout] = useState<ViewKey>("grid");

  const loadTop = useCallback(async () => {
    const [m, v, s] = await Promise.all([getMains(), listVessels(), getStats()]);
    setMains(m);
    setVessels(v);
    setStats(s);
  }, []);

  // Post-auth history cleanup handshake.
  // AuthCallback sets "_postAuthGoHome" then calls history.go(-delta) to
  // navigate back to "/", which causes a full reload.  Once MSAL has settled
  // (inProgress===none) we replace the current entry with /homepage — this
  // also discards forward history (including any Microsoft auth URLs) so the
  // back button can never land on login.microsoftonline.com again.
  useEffect(() => {
    if (!sessionStorage.getItem("_postAuthGoHome")) return;
    if (inProgress !== "none") return; // Wait for MSAL to finish initialising
    sessionStorage.removeItem("_postAuthGoHome");
    if (accounts.length > 0) {
      window.location.replace("/homepage?view=dashboard");
    }
    // If accounts is still empty after MSAL settled the auth didn't persist;
    // just stay on the login page (flag is already removed).
  }, [accounts, inProgress]);

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

  // Redirect unauthenticated users on the /homepage route back to the root path /
  useEffect(() => {
    if (
      !user &&
      inProgress === "none" &&
      accounts.length === 0 &&
      window.location.pathname === "/homepage"
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

  // Auto-authenticate from a cached MSAL session (only when MSAL is fully settled)
  useEffect(() => {
    let active = true;
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
              const errBody = await res.text();
              console.error("Backend validation failed during auto-login:", errBody);
              setAuthError(`Backend validation failed: ${res.status} ${res.statusText}. Details: ${errBody}`);
            }
          } catch (e) {
            console.error("Backend login sync failed during auto-login", e);
            setAuthError(`Backend connection failed: ${e instanceof Error ? e.message : String(e)}`);
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

  const signOutRef = useRef<() => void>(() => { });
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expireSessionRef = useRef<(reason: "inactivity" | "token_expiry") => void>(() => {});

  const navigateTo = useCallback((newView: "dashboard" | "explorer" | "profile", newPath: PathEntry[]) => {
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

    // Write the floor sentinel (replaces current entry, no extra history push)
    window.history.replaceState({ view: "dashboard", path: [], isInitial: true }, "", homeUrl);

    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state || {}) as { view?: string; path?: PathEntry[]; isInitial?: boolean };

      // Floor reached — bounce the user forward so they stay on the dashboard
      // instead of navigating away from the app entirely.
      if (state.isInitial) {
        window.history.forward();
        return;
      }

      // Sync React state with what the history entry remembers
      if (state.view === "dashboard" || state.view === "explorer" || state.view === "profile") {
        setView(state.view as "dashboard" | "explorer" | "profile");
        setPath(state.path || []);
      } else {
        setView("dashboard");
        setPath([]);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [user]);

  useEffect(() => {
    loadTop();
  }, [loadTop]);

  const currentId = path.length ? path[path.length - 1].id : null;

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
    } finally {
      setLoadingChildren(false);
    }
  }, [currentId, mains]);

  useEffect(() => {
    if (view === "explorer") loadCurrent();
  }, [view, currentId, loadCurrent]);

  useEffect(() => {
    setFQuery(""); // reset in-folder filter when navigating
  }, [currentId]);

  // ----- navigation -----
  const goDashboard = () => navigateTo("dashboard", []);
  const goProfile = () => navigateTo("profile", []);
  const openMain = (node: FolderNode) => navigateTo("explorer", [{ id: node.id, name: node.name }]);
  const openChild = (node: FolderNode) => {
    if (node.kind === "file") return;
    navigateTo("explorer", [...path, { id: node.id, name: node.name }]);
  };
  const crumbTo = (i: number) => navigateTo("explorer", i === 0 ? [] : path.slice(0, i));

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
    if (current?.kind === "main" && selectedVessel)
      items = items.filter((c) => c.kind !== "ship" || c.name === selectedVessel);
    const q = fQuery.trim().toLowerCase();
    if (q) items = items.filter((c) => c.name.toLowerCase().includes(q));
    items = items.filter((c) => matchesType(c, typeKey));
    return sortItems(items, sortKey);
  }, [children, current, selectedVessel, fQuery, typeKey, sortKey, archivedFolderIds]);

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
    await Promise.all([loadCurrent(), getStats().then(setStats)]);
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
          ? await monthUpload(node.id, file, category, user?.email)
          : await uploadFile(node.id, file, user?.email);
        let final = job;
        for (let i = 0; i < 10 && final.status === "processing"; i++) {
          await sleep(500);
          final = await getJob(job.id);
        }
        upsertToast({
          id,
          status: final.status,
          title: final.status === "done" ? "Uploaded & filed" : "Upload failed",
          detail: final.status === "done" && final.destination ? formatUploadSuccessDetail(final.destination) : final.destination,
          detectedMonth: final.detected_month,
        });
        await refreshAfterMutation();
        setTimeout(() => dismissToast(id), 6000);
      } catch (e) {
        upsertToast({ id, status: "failed", title: "Upload failed", detail: errDetail(e, file.name) });
        setTimeout(() => dismissToast(id), 6000);
      }
    },
    [refreshAfterMutation]
  );

  const handleDelete = useCallback(
    async (node: FolderNode) => {
      if (!window.confirm(`Delete "${node.name}"? This cannot be undone.`)) return;
      const id = Date.now() + Math.floor(Math.random() * 1000);
      try {
        await deleteFile(node.id, user?.email);
        await refreshAfterMutation();
        upsertToast({ id, status: "done", title: "Deleted", detail: node.name });
      } catch (e) {
        upsertToast({ id, status: "failed", title: "Delete failed", detail: errDetail(e, node.name) });
      }
      setTimeout(() => dismissToast(id), 5000);
    },
    [refreshAfterMutation]
  );

  const handleDownload = useCallback((node: FolderNode) => {
    const a = document.createElement("a");
    a.href = fileContentUrl(node.id);
    a.download = node.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const handleRenew = useCallback(
    async (node: FolderNode, newFile: File) => {
      if (!current) return;
      const id = Date.now() + Math.floor(Math.random() * 1000);
      upsertToast({ id, status: "processing", title: `Renewing ${node.name}`, detail: "Uploading new version…" });
      try {
        const job = current.month_driven
          ? await monthUpload(current.id, newFile, undefined, user?.email)
          : await uploadFile(current.id, newFile, user?.email);
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

  const handleBulkFolderArchive = useCallback(() => {
    if (archiveSelectIds.size === 0) return;
    const nodesToArchive = children.filter((c) => archiveSelectIds.has(c.id));
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
        logActivity(user.email, "archive_folder", `Archived folder: ${n.name}`)
      );
    }
    // Success toast
    const tid = Date.now() + Math.floor(Math.random() * 1000);
    upsertToast({
      id: tid,
      status: "done",
      title: `${nodesToArchive.length} folder${nodesToArchive.length !== 1 ? "s" : ""} archived`,
      detail: nodesToArchive.map((n) => n.name).join(", "),
    });
    setTimeout(() => dismissToast(tid), 4000);
  }, [archiveSelectIds, children, user]);

  const handleFolderArchive = useCallback((node: FolderNode) => {
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
    const isRestoring = archivedNodes.some((n) => n.id === node.id);
    if (user?.email) {
      logActivity(
        user.email,
        isRestoring ? "restore_folder" : "archive_folder",
        isRestoring ? `Restored folder: ${node.name}` : `Archived folder: ${node.name}`
      );
    }
    // Success toast
    const tid2 = Date.now() + Math.floor(Math.random() * 1000);
    upsertToast({
      id: tid2,
      status: "done",
      title: isRestoring ? `"${node.name}" restored` : `"${node.name}" archived`,
      detail: isRestoring ? "Folder is visible again" : "Folder hidden from main view",
    });
    setTimeout(() => dismissToast(tid2), 4000);
  }, [archivedNodes, user]);

  const handleBulkFolderDelete = useCallback(async () => {
    if (deleteFolderIds.size === 0) return;
    const id = Date.now() + Math.floor(Math.random() * 1000);
    // Build id→name map from children
    const nameMap = new Map(children.map((c) => [c.id, c.name]));
    setShowDeleteModal(false);
    upsertToast({ id, status: "processing", title: `Deleting ${deleteFolderIds.size} folder(s)…`, detail: "Please wait" });
    try {
      await Promise.all([...deleteFolderIds].map((fid) => deleteFolder(fid, user?.email, nameMap.get(fid))));
      await refreshAfterMutation();
      upsertToast({ id, status: "done", title: "Folders deleted", detail: `${deleteFolderIds.size} folder(s) removed` });
    } catch (e) {
      upsertToast({ id, status: "failed", title: "Delete failed", detail: errDetail(e, "") });
    }
    setDeleteFolderIds(new Set());
    setTimeout(() => dismissToast(id), 5000);
  }, [deleteFolderIds, children, refreshAfterMutation]);

  const handleCreate = async (data: import("./api").VesselInput) => {
    await createVessel(data);
    await loadTop();
    setView("explorer");
  };

  const handleCreateFolder = async () => {
    if (!current || !createFolderName.trim()) return;
    setCreateFolderLoading(true);
    setCreateFolderError(null);
    try {
      await createSubfolder(current.id, createFolderName.trim(), user?.email);
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
    }).catch(() => {});
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

    window.location.href = "/signout";
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
    const INACTIVITY_MS  = 8  * 60 * 60 * 1000;   // TODO: restore to 8  * 60 * 60 * 1000  (8 hours)
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
      const now          = Date.now();
      const loginAt      = parseInt(sessionStorage.getItem("session_login_at")      || "0", 10);
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
  const isMsalActive = accounts.length > 0 && !user && window.location.pathname !== "/signout";

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
      <div className="flex h-screen items-center justify-center bg-[#fbf5ee]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-violet-300 border-t-violet-600 animate-spin" />
          <p className="text-sm text-slate-500 tracking-wide font-semibold">Signing in…</p>
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
    return <LoginPage onAuthenticated={(u) => { setUser(u); setApiEmail(u.email); }} />;
  }

  // Profile page takes the full screen (no sidebar)
  if (view === "profile") {
    return (
      <ProfilePage
        mains={mains}
        userEmail={user.email}
        onBack={() => setView("explorer")}
        onDashboard={goDashboard}
        onSignOut={handleSignOut}
        onGlobalSignOut={handleGlobalSignOut}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        mains={mains}
        view={view}
        selectedMainId={path[0]?.id ?? null}
        onSelectMain={openMain}
        onDashboard={goDashboard}
        onNewVessel={() => setShowModal(true)}
        onSignOut={handleSignOut}
        onGlobalSignOut={handleGlobalSignOut}
        onProfile={goProfile}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar: vessel switcher + global search */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-8 py-2.5">
          <VesselSwitcher vessels={vessels} selected={selectedVessel} onSelect={setSelectedVessel} />
          <div className="ml-auto">
            <SearchBar onNavigate={navigateToResult} vesselScope={selectedVessel} />
          </div>
        </div>

        {view === "dashboard" ? (
          <>
            <header className="border-b border-slate-100 bg-white px-8 py-5">
              <h2 className="text-xl font-semibold text-slate-800">Dashboard</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Fleet overview · shared SharePoint Embedded container
              </p>
            </header>
            <div className="flex-1 overflow-y-auto bg-slate-50 px-8 py-6">
              <Dashboard
                vessels={vessels}
                mains={mains}
                stats={stats}
                onOpenMain={openMain}
                onNewVessel={() => setShowModal(true)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-slate-200 bg-white px-8 py-3">
              <Breadcrumb crumbs={crumbs} onNavigate={crumbTo} />
            </div>

            <header className="flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-8 py-5">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 truncate text-xl font-semibold text-slate-800">
                  {current ? (
                    <>
                      {(() => {
                        const { Icon, cls } = iconFor(current);
                        return <Icon className={"h-5 w-5 " + cls} />;
                      })()}
                      {current.name}
                    </>
                  ) : (
                    <>
                      <FolderOpen className="h-5 w-5 text-brand-600" />
                      All Main Folders
                    </>
                  )}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {current
                    ? current.month_driven
                      ? "Upload here — documents are auto-filed into monthly folders"
                      : `${displayed.filter((c) => c.kind !== "file").length} folders · ${displayed.filter((c) => c.kind === "file").length} files`
                    : "Shared container · pick a main folder to browse"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {current?.kind === "main" && (
                  <>
                    <button
                      onClick={() => { setArchiveSelectIds(new Set()); setShowArchiveSelectModal(true); }}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-500"
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </button>
                    <button
                      onClick={() => { setDeleteFolderIds(new Set()); setShowDeleteModal(true); }}
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-500"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Folders
                    </button>
                  </>
                )}
                {current?.month_driven && current.name === "Month End Reports" && (
                  <button
                    onClick={() => { setCreateFolderName(""); setCreateFolderError(null); setShowCreateFolderModal(true); }}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-violet-700 ring-1 ring-violet-200 bg-violet-50 hover:bg-violet-100 transition shadow-sm"
                  >
                    <FolderPlus className="h-4 w-4" />
                    Create Folder
                  </button>
                )}
                {canUpload && (
                  <UploadControl node={current!} onUpload={handleUpload} variant="primary" />
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-slate-50 px-8 py-6">
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
                  <p className="mx-auto max-w-5xl rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    Nothing matches your filter.
                  </p>
                ) : current?.month_driven ? (
                  current.name === "Month End Reports" ? (
                    <p className="mx-auto max-w-5xl rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                      No month folders yet — upload a document to auto-create one, or click <strong className="text-violet-600">Create Folder</strong> to add one manually.
                    </p>
                  ) : null
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
                />
              )}
            </div>
          </>
        )}
      </main>

      {showModal && (
        <CreateVesselModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}
      <PreviewDrawer file={preview} onClose={() => setPreview(null)} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

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
                  <h2 className="text-base font-semibold text-slate-800">Archive Folders</h2>
                  <p className="text-xs text-slate-500">Hide folders — restore anytime from the archived list</p>
                </div>
              </div>
              <button onClick={() => setShowArchiveSelectModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Two-column body */}
            <div className="flex divide-x divide-slate-100">

              {/* Left: Select folders to archive */}
              <div className="flex-1 p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Select to Archive</p>
                <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-1.5">
                  {children.filter((c) => c.kind !== "file" && !archivedFolderIds.has(c.id)).length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">No folders available.</p>
                  ) : (
                    children.filter((c) => c.kind !== "file" && !archivedFolderIds.has(c.id)).map((f) => (
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
                        <span className="text-sm font-medium text-slate-700">{f.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Right: Already archived */}
              <div className="w-64 shrink-0 bg-amber-50/40 p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                  Archived ({archivedNodes.length})
                </p>
                <div className="max-h-64 space-y-0.5 overflow-y-auto">
                  {archivedNodes.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">No archived folders yet.</p>
                  ) : (
                    archivedNodes.map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-amber-50 transition">
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{f.name}</span>
                        <button
                          onClick={() => setRestoreConfirmNode(f)}
                          className="ml-2 shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold text-brand-600 hover:bg-brand-50 transition"
                        >
                          Restore
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
              <button onClick={() => setShowArchiveSelectModal(false)}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button
                onClick={() => handleBulkFolderArchive()}
                disabled={archiveSelectIds.size === 0}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Archive {archiveSelectIds.size > 0 ? `(${archiveSelectIds.size})` : ""} Selected
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
                <h2 className="text-base font-semibold text-slate-800">Delete Folders</h2>
                <p className="text-xs text-slate-500">Selected folders will be permanently deleted</p>
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
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
                Cancel
              </button>
              <button
                onClick={() => handleBulkFolderDelete()}
                disabled={deleteFolderIds.size === 0}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete {deleteFolderIds.size > 0 ? `(${deleteFolderIds.size})` : ""}
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
                <h2 className="text-base font-semibold text-slate-800">Archived Folders</h2>
                <p className="text-xs text-slate-500">Deleted folders — restore to bring them back</p>
              </div>
            </div>
            <div className="mb-4 max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 p-2">
              {archivedNodes.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">No archived folders.</p>
              ) : (
                archivedNodes.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white">
                    <span className="text-sm font-medium text-slate-700">{f.name}</span>
                    <button
                      onClick={() => setRestoreConfirmNode(f)}
                      className="rounded-md px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 transition"
                    >
                      <ArchiveRestore className="mr-1 inline h-3.5 w-3.5" />Restore
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
              onChange={(e) => setCreateFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleCreateFolder()}
              placeholder="e.g. July 2026 or 2026-07"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
            />

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
}: {
  items: FolderNode[];
  accent: (typeof MAIN_ACCENTS)[string];
  layout: ViewKey;
  onOpen: (n: FolderNode) => void;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
  onDownload: (n: FolderNode) => void;
  onRenew: (n: FolderNode, f: File) => void;
}) {
  const folders = items.filter((i) => i.kind !== "file");
  const files = items.filter((i) => i.kind === "file");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {folders.length > 0 &&
        (layout === "grid" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {folders.map((n) => (
              <FolderCard key={n.id} node={n} accent={accent} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {folders.map((n) => (
              <FolderRow key={n.id} node={n} accent={accent} onOpen={onOpen} />
            ))}
          </div>
        ))}

      {files.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Files
          </p>
          {layout === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((f) => (
                <FileCard key={f.id} file={f} onPreview={onPreview} onDelete={onDelete} onDownload={onDownload} onRenew={onRenew} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
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
}: {
  node: FolderNode;
  accent: (typeof MAIN_ACCENTS)[string];
  onOpen: (n: FolderNode) => void;
}) {
  const { Icon, cls } = iconFor(node);
  return (
    <button
      onClick={() => onOpen(node)}
      className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
    >
      <span className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + accent.chip}>
        <Icon className={"h-5 w-5 " + cls} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{node.name}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{folderSubtitle(node)}</span>
      </span>
      {node.month_driven && (
        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-600 ring-1 ring-violet-100">
          auto-month
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
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
      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50"
    >
      <span className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " + accent.chip}>
        <Icon className={"h-4 w-4 " + cls} />
      </span>
      <span className="flex-1 truncate text-sm font-medium text-slate-800">{node.name}</span>
      <span className="text-xs text-slate-400">{folderSubtitle(node)}</span>
      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-brand-500" />
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
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
  onDownload: (n: FolderNode) => void;
  onRenew: (n: FolderNode, f: File) => void;
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
      const MENU_H = 200; // estimated menu height
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

  void onPreview;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
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
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
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
          className="w-44 rounded-xl bg-transparent py-0.5"
        >
          <button
            onClick={() => { onDownload(file); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 transition-all hover:bg-brand-600 hover:text-white hover:shadow-sm"
          >
            <Download className="h-4 w-4 text-brand-600" />
            Download
          </button>
          <button
            onClick={() => renewInputRef.current?.click()}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 transition-all hover:bg-brand-600 hover:text-white hover:shadow-sm"
          >
            <RotateCcw className="h-4 w-4 text-violet-600" />
            Renew
          </button>
          <div className="my-0.5" />
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(file); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-rose-600 transition-all hover:bg-rose-600 hover:text-white hover:shadow-sm"
          >
            <Trash2 className="h-4 w-4" />
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
      className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
    >
      <span className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + meta.chip}>
        <meta.Icon className={"h-5 w-5 " + meta.cls} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">{file.name}</span>
        <span className="mt-0.5 block truncate text-xs text-slate-400">{sub || meta.label}</span>
      </span>
      <div className="opacity-0 transition group-hover:opacity-100">
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
      className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50"
    >
      <meta.Icon className={"h-4 w-4 shrink-0 " + meta.cls} />
      <span className="flex-1 truncate text-sm text-slate-700">{file.name}</span>
      <span className={"rounded px-1.5 py-0.5 text-[10px] font-medium " + meta.chip}>{meta.label}</span>
      <span className="hidden w-16 text-right text-xs text-slate-400 sm:block">{formatSize(file.size)}</span>
      <span className="hidden w-24 text-right text-xs text-slate-400 md:block">{formatDate(file.modified)}</span>
      <div className="opacity-0 transition group-hover:opacity-100">
        <FileActions file={file} onPreview={onPreview} onDelete={onDelete} onDownload={onDownload} onRenew={onRenew} />
      </div>
    </div>
  );
}

function EmptyFolder({ canUpload }: { canUpload: boolean }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50">
        <FolderOpen className="h-7 w-7 text-brand-600" />
      </div>
      <h3 className="text-base font-semibold text-slate-800">This folder is empty</h3>
      <p className="mt-1 text-sm text-slate-500">
        {canUpload
          ? "Use the Upload button in the top-right to add a document."
          : "Open a sub-folder to continue."}
      </p>
    </div>
  );
}
