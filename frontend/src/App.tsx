import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Eye, FolderOpen, Trash2 } from "lucide-react";
import {
  createVessel,
  deleteFile,
  fileContentUrl,
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
import { MAIN_ACCENTS, iconFor } from "./components/nodeStyle";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errDetail(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { detail?: string } } })?.response?.data
      ?.detail ?? fallback
  );
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
  const [view, setView] = useState<"dashboard" | "explorer">("dashboard");
  const [path, setPath] = useState<PathEntry[]>([]);
  const [current, setCurrent] = useState<FolderNode | null>(null);
  const [children, setChildren] = useState<FolderNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const loadTop = useCallback(async () => {
    const [m, v, s] = await Promise.all([getMains(), listVessels(), getStats()]);
    setMains(m);
    setVessels(v);
    setStats(s);
  }, []);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
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

  // Auto-authenticate from a cached MSAL session (only when MSAL is fully settled)
  useEffect(() => {
    let active = true;
    if (
      inProgress === "none" &&
      accounts.length > 0 &&
      !user &&
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
            } else {
              console.error("Backend validation failed during auto-login");
            }
          } catch (e) {
            console.error("Backend login sync failed during auto-login", e);
          }
        })
        .catch((err) => {
          console.error("Token acquisition failed during auto-login", err);
        });
    }
    return () => {
      active = false;
    };
  }, [accounts, inProgress, user, instance]);

  // Redirect to /homepage when authenticated
  useEffect(() => {
    if (user && window.location.pathname !== "/homepage") {
      window.history.replaceState({}, "", "/homepage");
    }
  }, [user]);
  useEffect(() => {
    loadTop();
  }, [loadTop]);

  const currentId = path.length ? path[path.length - 1].id : null;

  // Load the current folder's node + children whenever navigation changes.
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

  // ----- navigation -----
  const goDashboard = () => setView("dashboard");
  const openMain = (node: FolderNode) => {
    setView("explorer");
    setPath([{ id: node.id, name: node.name }]);
  };
  const openChild = (node: FolderNode) => {
    if (node.kind === "file") return;
    setPath((p) => [...p, { id: node.id, name: node.name }]);
  };
  const crumbTo = (i: number) => setPath((p) => (i === 0 ? [] : p.slice(0, i)));

  const crumbs: Crumb[] = useMemo(
    () => [{ id: null, name: "Home" }, ...path.map((p) => ({ id: p.id, name: p.name }))],
    [path]
  );

  const navigateToResult = (r: SearchResult) => {
    const trail = r.trail.slice();
    if (r.kind === "file") trail.pop(); // open the file's parent folder
    setView("explorer");
    setPath(trail.map((t) => ({ id: t.id, name: t.name })));
  };

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
        detail: node.month_driven
          ? "Detecting month from document…"
          : `to ${node.name}`,
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
        upsertToast({
          id,
          status: "failed",
          title: "Upload failed",
          detail: errDetail(e, file.name),
        });
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
        upsertToast({
          id,
          status: "failed",
          title: "Delete failed",
          detail: errDetail(e, node.name),
        });
      }
      setTimeout(() => dismissToast(id), 5000);
    },
    [refreshAfterMutation]
  );

  const handleCreate = async (name: string, imo: string) => {
    await createVessel(name, imo || undefined);
    await loadTop();
    setView("explorer");
    // Land in the first main folder so the new ship is visible.
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

    // Call MSAL logout locally for all accounts to clear cookies/session/local cache
    for (const account of accounts) {
      try {
        await instance.logoutRedirect({
          account,
          onRedirectNavigate: () => false // blocks browser redirect to Microsoft
        } as any);
      } catch (e) {
        console.error("Local logout failed for account", account.username, e);
      }
    }

    sessionStorage.clear();
    localStorage.clear();
    window.location.href = "/signout";
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

    // Call MSAL logout locally for all accounts to clear cookies/session/local cache
    // without redirecting to Microsoft's account-picking/logout pages.
    for (const account of accounts) {
      try {
        await instance.logoutRedirect({
          account,
          onRedirectNavigate: () => false // blocks browser redirect to Microsoft
        } as any);
      } catch (e) {
        console.error("Local logout failed for account", account.username, e);
      }
    }

    sessionStorage.clear();
    localStorage.clear();
    window.location.href = "/signout";
  };

  const mainName = path.length ? path[0].name : undefined;
  const accent = (mainName && MAIN_ACCENTS[mainName]) || MAIN_ACCENTS["Insurance"];
  const canUpload = !!current && (current.upload || current.month_driven);
  // Show a neutral loading screen while MSAL is handling any interaction
  // or when we are in the process of auto-authenticating a cached account.
  // This prevents the login page from briefly flashing before moving to the home page.
  const isMsalActive = accounts.length > 0 && !user && window.location.pathname !== "/signout";

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

  if (!user) {
    return <LoginPage onAuthenticated={setUser} />;
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
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Persistent top bar with global search */}
        <div className="flex items-center justify-end border-b border-slate-200 bg-white px-8 py-2.5">
          <SearchBar onNavigate={navigateToResult} />
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
            {/* Breadcrumb bar */}
            <div className="border-b border-slate-200 bg-white px-8 py-3">
              <Breadcrumb crumbs={crumbs} onNavigate={crumbTo} />
            </div>

            {/* Page header */}
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
                      : `${children.filter((c) => c.kind !== "file").length} folders · ${children.filter((c) => c.kind === "file").length} files`
                    : "Shared container · pick a main folder to browse"}
                </p>
              </div>

              {canUpload && (
                <UploadControl node={current!} onUpload={handleUpload} variant="primary" />
              )}
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-slate-50 px-8 py-6">
              {loadingChildren ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : children.length === 0 ? (
                current?.month_driven ? (
                  <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                    No month folders yet — upload a document to create one.
                  </p>
                ) : (
                  <EmptyFolder canUpload={canUpload} />
                )
              ) : (
                <FolderGrid
                  items={children}
                  accent={accent}
                  onOpen={openChild}
                  onDelete={handleDelete}
                />
              )}
            </div>
          </>
        )}
      </main>

      {showModal && (
        <CreateVesselModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function FolderGrid({
  items,
  accent,
  onOpen,
  onDelete,
}: {
  items: FolderNode[];
  accent: (typeof MAIN_ACCENTS)[string];
  onOpen: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
}) {
  const folders = items.filter((i) => i.kind !== "file");
  const files = items.filter((i) => i.kind === "file");
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {folders.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((n) => (
            <FolderCard key={n.id} node={n} accent={accent} onOpen={onOpen} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Files
          </p>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {files.map((f) => {
              const { Icon, cls } = iconFor(f);
              return (
                <div
                  key={f.id}
                  className="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50"
                >
                  <Icon className={"h-4 w-4 " + cls} />
                  <span className="flex-1 truncate text-sm text-slate-700">
                    {f.name}
                  </span>
                  {f.ext && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                      {f.ext}
                    </span>
                  )}
                  <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <a
                      href={fileContentUrl(f.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50"
                      title="View document"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </a>
                    <button
                      onClick={() => onDelete(f)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                      title="Delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
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
      <span
        className={
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " +
          accent.chip
        }
      >
        <Icon className={"h-5 w-5 " + cls} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">
          {node.name}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
          {node.kind === "ship"
            ? "Vessel"
            : node.month_driven
              ? "Auto-month folder"
              : node.kind === "month"
                ? "Monthly"
                : node.name.toLowerCase().includes("common")
                  ? "Common"
                  : "Folder"}
        </span>
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
