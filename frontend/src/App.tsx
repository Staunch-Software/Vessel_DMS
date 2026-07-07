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
  const [stats, setStats] = useState<Stats | null>(null);
  const [view, setView] = useState<"dashboard" | "explorer">("dashboard");
  const [path, setPath] = useState<PathEntry[]>([]);
  const [current, setCurrent] = useState<FolderNode | null>(null);
  const [children, setChildren] = useState<FolderNode[]>([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
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

  const mainName = path.length ? path[0].name : undefined;
  const accent = (mainName && MAIN_ACCENTS[mainName]) || MAIN_ACCENTS["Insurance"];
  const canUpload = !!current && (current.upload || current.month_driven);
  const showToolbar = view === "explorer" && !!current && children.length > 0;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        mains={mains}
        view={view}
        selectedMainId={path[0]?.id ?? null}
        onSelectMain={openMain}
        onDashboard={goDashboard}
        onNewVessel={() => setShowModal(true)}
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
              {canUpload && (
                <UploadControl node={current!} onUpload={handleUpload} variant="primary" />
              )}
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
