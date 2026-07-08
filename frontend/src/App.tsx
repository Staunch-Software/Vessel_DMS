import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { ChevronRight, Eye, FolderOpen, FolderPlus, Trash2, X } from "lucide-react";
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
  monthUpload,
  uploadFile,
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
<<<<<<< HEAD
import ProfilePage from "./components/Profile";
import AuthCallback from "./AuthCallback";


=======
import { fileMeta, formatDate, formatSize } from "./components/fileType";
>>>>>>> dev/seenu

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
<<<<<<< HEAD
  const [authError, setAuthError] = useState<string | null>(null);
<<<<<<< Updated upstream
=======
  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);
  const [preview, setPreview] = useState<FolderNode | null>(null);

  // In-folder toolbar state
  const [fQuery, setFQuery] = useState("");
  const [typeKey, setTypeKey] = useState<TypeKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [layout, setLayout] = useState<ViewKey>("grid");
>>>>>>> dev/seenu
=======
  const [sessionExpiredReason, setSessionExpiredReason] = useState<"inactivity" | "token_expiry" | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createFolderName, setCreateFolderName] = useState("");
  const [createFolderLoading, setCreateFolderLoading] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
>>>>>>> Stashed changes

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
              setUser({
                display_name: payload.display_name || account.name || account.username,
                email: payload.email || account.username,
              });
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
    let items = children;
    if (current?.kind === "main" && selectedVessel)
      items = items.filter((c) => c.kind !== "ship" || c.name === selectedVessel);
    const q = fQuery.trim().toLowerCase();
    if (q) items = items.filter((c) => c.name.toLowerCase().includes(q));
    items = items.filter((c) => matchesType(c, typeKey));
    return sortItems(items, sortKey);
  }, [children, current, selectedVessel, fQuery, typeKey, sortKey]);

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
      await createSubfolder(current.id, createFolderName.trim());
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
      try {
        // onRedirectNavigate returning false clears the MSAL token cache
        // locally without navigating the browser to Microsoft's logout page.
        await instance.logoutRedirect({
          account,
          onRedirectNavigate: () => false,
        });
      } catch (e) {
        console.error("MSAL logout failed", e);
      }
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
      instance.logoutRedirect({ account, onRedirectNavigate: () => false }).catch(() => {});
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
      try {
        await instance.logoutRedirect({
          account: accounts[0],
          onRedirectNavigate: () => false,
        });
      } catch (e) {
        console.error("MSAL silent cache clear failed", e);
      }
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
<<<<<<< HEAD
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
    return <LoginPage onAuthenticated={setUser} />;
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
=======
  const showToolbar = view === "explorer" && !!current && children.length > 0;
>>>>>>> dev/seenu

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
<<<<<<< Updated upstream
              {canUpload && (
                <UploadControl node={current!} onUpload={handleUpload} variant="primary" />
              )}
=======

              <div className="flex items-center gap-3">
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
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
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
=======
                <p className="text-sm text-slate-500">Loading…</p>
              ) : children.length === 0 ? (
                current?.month_driven ? (
                  current.name === "Month End Reports" ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                      No month folders yet — upload a document to auto-create one, or click <strong className="text-violet-600">Create Folder</strong> to add one manually.
                    </p>
                  ) : null
>>>>>>> Stashed changes
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
}: {
  items: FolderNode[];
  accent: (typeof MAIN_ACCENTS)[string];
  layout: ViewKey;
  onOpen: (n: FolderNode) => void;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
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
                <FileCard key={f.id} file={f} onPreview={onPreview} onDelete={onDelete} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {files.map((f) => (
                <FileRow key={f.id} file={f} onPreview={onPreview} onDelete={onDelete} />
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
}: {
  file: FolderNode;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onPreview(file); }}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50"
        title="View document"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(file); }}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
        title="Delete document"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>
    </div>
  );
}

function FileCard({
  file,
  onPreview,
  onDelete,
}: {
  file: FolderNode;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
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
        <FileActions file={file} onPreview={onPreview} onDelete={onDelete} />
      </div>
    </div>
  );
}

function FileRow({
  file,
  onPreview,
  onDelete,
}: {
  file: FolderNode;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
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
        <FileActions file={file} onPreview={onPreview} onDelete={onDelete} />
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
