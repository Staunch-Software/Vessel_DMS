import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Eye, FolderOpen, Trash2 } from "lucide-react";
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
  const [view, setView] = useState<"dashboard" | "explorer" | "approvals" | "settings">("dashboard");
  const [path, setPath] = useState<PathEntry[]>([]);
  const [current, setCurrent] = useState<FolderNode | null>(null);
  const [children, setChildren] = useState<FolderNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [selectedVessel, setSelectedVessel] = useState<string | null>(null);
  const [preview, setPreview] = useState<FolderNode | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

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

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
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
      window.location.pathname === "/homepage"
    ) {
      window.history.replaceState({}, "", "/");
    }
  }, [user, inProgress, accounts]);

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
              setUser({
                display_name: payload.display_name || account.name || account.username,
                email: payload.email || account.username,
              });
            } else {
              const body = await res.text();
              console.error("Backend validation failed during auto-login:", res.status, body);
              setAuthError("Signed in with Microsoft, but the server rejected the session. Please try again.");
            }
          } catch (e) {
            console.error("Backend login sync failed during auto-login", e);
            setAuthError("Could not reach the server to complete sign-in. Please try again.");
          }
        })
        .catch((err) => {
          console.error("Token acquisition failed during auto-login", err);
          setAuthError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
        });
    }
    return () => {
      active = false;
    };
  }, [accounts, inProgress, user, instance]);

  // Redirect to /homepage when authenticated
  useEffect(() => {
    if (user && window.location.pathname !== "/homepage") {
      captureDiagnostics("before homepage replaceState");
      window.history.replaceState({}, "", "/homepage");
      captureDiagnostics("after homepage replaceState");
    }
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
  const goDashboard = () => setView("dashboard");
  const goApprovals = () => setView("approvals");
  const goSettings = () => setView("settings");
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
          ? await monthUpload(node.id, file, category, user?.email ?? "", user?.display_name)
          : await uploadFile(node.id, file, user?.email ?? "", user?.display_name);
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
    [refreshAfterMutation, user]
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

  const handleCreate = async (name: string, imo: string) => {
    await createVessel(name, imo || undefined);
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
    // Replace (not push) so the now-signed-out /homepage entry isn't left in
    // history for Back to return to.
    window.location.replace("/signout");
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
    window.location.replace("/signout");
  };

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
    return <LoginPage onAuthenticated={setUser} authError={authError} />;
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
        isAdmin={ADMIN_EMAILS.includes(user.email.toLowerCase())}
        onApprovals={goApprovals}
        onSettings={goSettings}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar: vessel switcher + global search */}
        {view !== "settings" && view !== "approvals" && (
          <div className="flex items-center gap-3 border-b border-border bg-surface px-8 py-2.5">
            <VesselSwitcher vessels={vessels} selected={selectedVessel} onSelect={setSelectedVessel} />
            <div className="ml-auto">
              <SearchBar onNavigate={navigateToResult} vesselScope={selectedVessel} />
            </div>
          </div>
        )}

        {view === "settings" ? (
          <ThemeSettings />
        ) : view === "approvals" ? (
          <Approvals actingEmail={user.email} />
        ) : view === "dashboard" ? (
          <>
            <header className="border-b border-border bg-surface px-8 py-5">
              <h2 className="text-xl font-semibold text-fg">Dashboard</h2>
              <p className="mt-0.5 text-sm text-muted">
                Fleet overview · shared SharePoint Embedded container
              </p>
            </header>
            <div className="flex-1 overflow-y-auto bg-bg px-8 py-6">
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
            <div className="border-b border-border bg-surface px-8 py-3">
              <Breadcrumb crumbs={crumbs} onNavigate={crumbTo} />
            </div>

            <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-8 py-5">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 truncate text-xl font-semibold text-fg">
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
                      <FolderOpen className="h-5 w-5 text-primary" />
                      All Main Folders
                    </>
                  )}
                </h2>
                <p className="mt-0.5 text-sm text-muted">
                  {current
                    ? current.month_driven
                      ? "Upload here — documents are auto-filed into monthly folders"
                      : `${displayed.filter((c) => c.kind !== "file").length} folders · ${displayed.filter((c) => c.kind === "file").length} files`
                    : "Shared container · pick a main folder to browse"}
                </p>
              </div>
              {canUpload && (
                <UploadControl node={current!} onUpload={handleUpload} variant="primary" />
              )}
            </header>

            <div className="flex-1 overflow-y-auto bg-bg px-8 py-6">
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
                  <p className="mx-auto max-w-5xl rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-muted">
                    Nothing matches your filter.
                  </p>
                ) : current?.month_driven ? (
                  <p className="mx-auto max-w-5xl rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center text-sm text-muted">
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
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {folders.map((n) => (
              <FolderRow key={n.id} node={n} accent={accent} onOpen={onOpen} />
            ))}
          </div>
        ))}

      {files.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-subtle">
            Files
          </p>
          {layout === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((f) => (
                <FileCard key={f.id} file={f} onPreview={onPreview} onDelete={onDelete} />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
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
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + accent.chip}>
        <Icon className={"h-5 w-5 " + cls} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{node.name}</span>
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
}: {
  file: FolderNode;
  onPreview: (n: FolderNode) => void;
  onDelete: (n: FolderNode) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onPreview(file); }}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
        title="View document"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(file); }}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-error transition hover:bg-error-bg"
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
      className="group flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <span className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + meta.chip}>
        <meta.Icon className={"h-5 w-5 " + meta.cls} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{file.name}</span>
        <span className="mt-0.5 block truncate text-xs text-subtle">{sub || meta.label}</span>
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
      className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-bg"
    >
      <meta.Icon className={"h-4 w-4 shrink-0 " + meta.cls} />
      <span className="flex-1 truncate text-sm text-fg">{file.name}</span>
      <span className={"rounded px-1.5 py-0.5 text-[10px] font-medium " + meta.chip}>{meta.label}</span>
      <span className="hidden w-16 text-right text-xs text-subtle sm:block">{formatSize(file.size)}</span>
      <span className="hidden w-24 text-right text-xs text-subtle md:block">{formatDate(file.modified)}</span>
      <div className="opacity-0 transition group-hover:opacity-100">
        <FileActions file={file} onPreview={onPreview} onDelete={onDelete} />
      </div>
    </div>
  );
}

function EmptyFolder({ canUpload }: { canUpload: boolean }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-border-strong bg-surface p-10 text-center">
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
