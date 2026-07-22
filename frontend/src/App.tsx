import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { ChevronRight, FolderOpen, Trash2, MoreVertical, Download, RotateCcw, LayoutGrid, Rows3 } from "lucide-react";
import {
  createVessel,
  deleteFile,
  getChildren,
  getFolder,
  getJob,
  getMains,
  getStats,
  listVessels,
  monthUpload,
  setApiEmail,
  uploadFile,
  fileContentUrl,
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

interface ShipListRow {
  pathKey: string;
  group: string;
  category: string;
  subFolderPath: string;
  file: FolderNode;
}

function alphaSuffix(n: number): string {
  if (n <= 0) return "";
  let v = n;
  let out = "";
  while (v > 0) {
    v -= 1;
    out = String.fromCharCode(97 + (v % 26)) + out;
    v = Math.floor(v / 26);
  }
  return out;
}

function deriveListColumns(folderSegments: string[]): { group: string; category: string; subFolderPath: string } {
  const clean = folderSegments.filter(Boolean);
  if (clean.length === 0) {
    return { group: "-", category: "-", subFolderPath: "-" };
  }
  const category = clean.length >= 2 ? clean[clean.length - 2] : clean[0];
  const group = clean.length >= 3 ? clean[clean.length - 3] : clean[0];
  return {
    group,
    category,
    subFolderPath: clean.join(" > "),
  };
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
  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);
  const [preview, setPreview] = useState<FolderNode | null>(null);
  const [archivedFolderIds] = useState<Set<string>>(new Set());

  // In-folder toolbar state
  const [fQuery, setFQuery] = useState("");
  const [typeKey, setTypeKey] = useState<TypeKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [layout, setLayout] = useState<ViewKey>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [shipViewMode, setShipViewMode] = useState<"folder" | "list">("folder");
  const [shipRows, setShipRows] = useState<ShipListRow[]>([]);
  const [shipListLoading, setShipListLoading] = useState(false);
  const [shipListError, setShipListError] = useState<string | null>(null);
  const [shipListQuery, setShipListQuery] = useState("");

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

  useEffect(() => {
    setShipViewMode("folder");
    setShipListQuery("");
    setShipRows([]);
    setShipListError(null);
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
    let items = children;
    if (current?.kind === "main" && selectedVessel)
      items = items.filter((c) => c.kind !== "ship" || c.name === selectedVessel);
    const q = fQuery.trim().toLowerCase();
    if (q) items = items.filter((c) => c.name.toLowerCase().includes(q));
    items = items.filter((c) => matchesType(c, typeKey));
    return sortItems(items, sortKey);
  }, [children, current, selectedVessel, fQuery, typeKey, sortKey, archivedFolderIds]);

  const isShipRoot = useMemo(() => {
    if (view !== "explorer" || !current) return false;
    if (current.kind === "ship") return true;
    // Some datasets classify vessel roots as generic folders.
    // Treat depth-2 folders under a main folder as vessel roots,
    // excluding known shared/common branches.
    const isDepthTwo = path.length === 2;
    const isCommonLike = current.name.toLowerCase().includes("common");
    return isDepthTwo && current.kind !== "main" && !isCommonLike;
  }, [view, current, path.length]);

  const buildShipListRows = useCallback(async () => {
    if (!current || current.kind !== "ship") return;
    setShipListLoading(true);
    setShipListError(null);
    try {
      const rows: ShipListRow[] = [];

      const walk = async (folderId: string, segments: string[]) => {
        const kids = await getChildren(folderId);
        const folders: FolderNode[] = [];
        for (const item of kids) {
          if (item.kind === "file") {
            const cols = deriveListColumns(segments);
            rows.push({
              pathKey: cols.subFolderPath,
              group: cols.group,
              category: cols.category,
              subFolderPath: cols.subFolderPath,
              file: item,
            });
          } else {
            folders.push(item);
          }
        }

        await Promise.all(
          folders.map((folder) => walk(folder.id, [...segments, folder.name]))
        );
      };

      await walk(current.id, []);

      rows.sort((a, b) => {
        const p = a.pathKey.localeCompare(b.pathKey);
        if (p !== 0) return p;
        return a.file.name.localeCompare(b.file.name);
      });
      setShipRows(rows);
    } catch (e) {
      setShipListError(e instanceof Error ? e.message : "Could not load list view.");
      setShipRows([]);
    } finally {
      setShipListLoading(false);
    }
  }, [current]);

  useEffect(() => {
    if (isShipRoot && shipViewMode === "list") {
      void buildShipListRows();
    }
  }, [isShipRoot, shipViewMode, buildShipListRows]);

  const filteredShipRows = useMemo(() => {
    const q = shipListQuery.trim().toLowerCase();
    if (!q) return shipRows;
    return shipRows.filter((r) => {
      const hay = `${r.group} ${r.category} ${r.subFolderPath} ${r.file.name}`.toLowerCase();
      return hay.includes(q);
    });
  }, [shipRows, shipListQuery]);

  const shipTableRows = useMemo(() => {
    const counts = new Map<string, number>();
    const firstIdx = new Map<string, number>();
    const pathOrder = new Map<string, number>();
    const seen = new Map<string, number>();

    filteredShipRows.forEach((r, i) => {
      counts.set(r.pathKey, (counts.get(r.pathKey) ?? 0) + 1);
      if (!firstIdx.has(r.pathKey)) firstIdx.set(r.pathKey, i);
      if (!pathOrder.has(r.pathKey)) pathOrder.set(r.pathKey, pathOrder.size + 1);
    });

    return filteredShipRows.map((r, i) => {
      const offset = seen.get(r.pathKey) ?? 0;
      seen.set(r.pathKey, offset + 1);
      const base = pathOrder.get(r.pathKey) ?? i + 1;
      return {
        ...r,
        showMerged: firstIdx.get(r.pathKey) === i,
        rowSpan: counts.get(r.pathKey) ?? 1,
        serial: offset === 0 ? `${base}` : `${base}${alphaSuffix(offset)}`,
      };
    });
  }, [filteredShipRows]);

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
          ? await monthUpload(node.id, file, category)
          : await uploadFile(node.id, file);
        let final = job;
        for (let i = 0; i < 10 && final.status === "processing"; i++) {
          await sleep(500);
          final = await getJob(job.id);
        }
        upsertToast({
          id,
          status: final.status,
          title: final.status === "done" ? "Uploaded & filed" : "Upload failed",
          detail: final.destination,
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
        await deleteFile(node.id);
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
      upsertToast({ id, status: "processing", title: `Renewing ${node.name}`, detail: "Uploading new version\u2026" });
      try {
        const job = current.month_driven
          ? await monthUpload(current.id, newFile)
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

  const handleCreate = async (data: import("./api").VesselInput) => {
    await createVessel(data);
    await loadTop();
    setView("explorer");
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
      // Clear MSAL local cache without triggering a server-side redirect
      instance.setActiveAccount(null);
    }

    window.location.href = "/signout";
  };

  // Keep ref up-to-date so the popstate handler always calls the latest version
  signOutRef.current = handleSignOut;

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
    // Clear MSAL local cache without server-side redirect
    if (accounts.length > 0) {
      instance.setActiveAccount(null);
    }

    window.location.href = "/signout";
  };

  const mainName = path.length ? path[0].name : undefined;
  const accent = (mainName && MAIN_ACCENTS[mainName]) || MAIN_ACCENTS["Insurance"];
  const canUpload = !!current && (current.upload || current.month_driven);
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
        onAuthenticated={(u) => { setUser(u); setApiEmail(u.email); }}
        signedOut
        onSignBackIn={() => {
          window.location.href = "/";
        }}
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
  const showToolbar = view === "explorer" && !!current && children.length > 0 && (!isShipRoot || shipViewMode === "folder");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        mains={mains}
        view={view}
        selectedMainId={path[0]?.id ?? null}
        onSelectMain={openMain}
        onDashboard={goDashboard}
        onVessels={() => navigateTo("explorer", [])}
        onNewVessel={() => setShowModal(true)}
        onSignOut={handleSignOut}
        onGlobalSignOut={handleGlobalSignOut}
        onProfile={goProfile}
        onArchive={() => {}}
        onRecycleBin={() => {}}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar: vessel switcher + global search */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-8 py-2.5">
          <VesselSwitcher vessels={vessels} selected={selectedVessel} onSelect={setSelectedVessel} />
          <div className="ml-auto">
            <SearchBar
              onNavigate={navigateToResult}
              vessels={vessels}
              vesselId={vessels.find((v) => v.name === selectedVessel)?.id ?? null}
              onVesselChange={(vesselId) => {
                const vessel = vessels.find((v) => v.id === vesselId) ?? null;
                setSelectedVessel(vessel?.name ?? null);
              }}
              query={searchQuery}
              onQueryChange={setSearchQuery}
            />
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
                onOpenVessel={(vessel) => {
                  setSelectedVessel(vessel.name);
                  navigateTo("explorer", []);
                }}
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
                    ? isShipRoot && shipViewMode === "list"
                      ? `${shipRows.length} file${shipRows.length === 1 ? "" : "s"} indexed in flattened list view`
                      : current.month_driven
                      ? "Upload here — documents are auto-filed into monthly folders"
                      : `${displayed.filter((c) => c.kind !== "file").length} folders · ${displayed.filter((c) => c.kind === "file").length} files`
                    : "Shared container · pick a main folder to browse"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isShipRoot && (
                  <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-1">
                    <button
                      onClick={() => setShipViewMode("folder")}
                      className={
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition " +
                        (shipViewMode === "folder"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100")
                      }
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      Folder view
                    </button>
                    <button
                      onClick={() => setShipViewMode("list")}
                      className={
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition " +
                        (shipViewMode === "list"
                          ? "bg-slate-900 text-white"
                          : "text-slate-600 hover:bg-slate-100")
                      }
                    >
                      <Rows3 className="h-3.5 w-3.5" />
                      List view
                    </button>
                  </div>
                )}
                {canUpload && (
                  <UploadControl node={current!} onUpload={handleUpload} variant="primary" />
                )}
              </div>
            </header>

            <div className="flex-1 overflow-y-auto bg-slate-50 px-8 py-6">
              {isShipRoot && shipViewMode === "list" ? (
                <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <input
                      value={shipListQuery}
                      onChange={(e) => setShipListQuery(e.target.value)}
                      placeholder="Filter by group, category, sub-folder path or file name..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none"
                    />
                  </div>

                  {shipListLoading ? (
                    <div className="p-6 text-sm text-slate-500">Building vessel list view...</div>
                  ) : shipListError ? (
                    <div className="p-6 text-sm text-rose-600">{shipListError}</div>
                  ) : shipTableRows.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">No files found for this vessel.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="px-3 py-2.5 text-left">Sr.</th>
                            <th className="px-3 py-2.5 text-left">Group</th>
                            <th className="px-3 py-2.5 text-left">Category</th>
                            <th className="px-3 py-2.5 text-left">Sub-Folder Path</th>
                            <th className="px-3 py-2.5 text-left">File Name</th>
                            <th className="px-3 py-2.5 text-left">Attachment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shipTableRows.map((row) => (
                            <tr key={row.file.id} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                              <td className="px-3 py-2.5 text-xs text-slate-500">{row.serial}</td>
                              {row.showMerged && (
                                <td rowSpan={row.rowSpan} className="px-3 py-2.5 text-xs font-semibold text-slate-700">{row.group}</td>
                              )}
                              {row.showMerged && (
                                <td rowSpan={row.rowSpan} className="px-3 py-2.5 text-xs text-slate-600">{row.category}</td>
                              )}
                              {row.showMerged && (
                                <td rowSpan={row.rowSpan} className="px-3 py-2.5 text-xs text-slate-600">{row.subFolderPath}</td>
                              )}
                              <td className="px-3 py-2.5 text-sm font-medium text-slate-800">{row.file.name}</td>
                              <td className="px-3 py-2.5 text-xs">
                                <a
                                  href={fileContentUrl(row.file.id)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-semibold text-blue-600 hover:text-blue-700"
                                >
                                  Open
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : showToolbar && (
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
              {!isShipRoot || shipViewMode === "folder"
                ? loadingChildren ? (
                <FolderGridSkeleton />
              ) : displayed.length === 0 ? (
                children.length > 0 ? (
                  <p className="mx-auto max-w-5xl rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    Nothing matches your filter.
                  </p>
                ) : current?.month_driven ? (
                  <p className="mx-auto max-w-5xl rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    No month folders yet — upload a document to create one.
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
                />
              ) : null}
            </div>
          </>
        )}
      </main>

      {showModal && (
        <CreateVesselModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
          vessels={vessels}
        />
      )}
      <PreviewDrawer file={preview} onClose={() => setPreview(null)} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
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
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
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
  const menuRef = useRef<HTMLDivElement>(null);
  const renewInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  void onPreview; // card click handles preview

  return (
    <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
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
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        title="More actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          <button
            onClick={() => { onDownload(file); setOpen(false); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-brand-600" />
            Download
          </button>
          <button
            onClick={() => renewInputRef.current?.click()}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4 text-violet-600" />
            Renew
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            onClick={() => { onDelete(file); setOpen(false); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
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
