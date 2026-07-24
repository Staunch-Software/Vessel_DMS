import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ExternalLink, Loader2, Search, Upload, Trash2 } from "lucide-react";
import { getChildren, fileContentUrl, getJob, monthUpload, uploadFile, type FolderNode } from "../api";

interface FlatRow {
  srNo: string;
  vesselName: string;
  group: string;
  category: string;
  subFolderPath: string;
  fileName: string | null;
  fileId: string | null;
  fileNode: FolderNode | null;
  groupKey: string;
  uploadFolderId: string;
  monthDriven: boolean;
  canUpload: boolean;
}

interface LeafEntry {
  vesselName: string;
  group: string;
  category: string;
  pathParts: string[];
  files: FolderNode[];
  folder: FolderNode;
}

interface UploadTarget {
  groupKey: string;
  uploadFolderId: string;
  monthDriven: boolean;
}

interface Props {
  mainFolderId: string;
  mainFolderName: string;
  onPreviewFile?: (file: FolderNode) => void;
  onDeleteFile?: (file: FolderNode) => void;
}

const FETCH_CONCURRENCY = 10;
const VESSEL_PAGE_SIZE = 4;
const mainRowsCache = new Map<string, FlatRow[]>();

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  });

  await Promise.all(workers);
  return results;
}

function leafToRows(leaf: LeafEntry, index: number): FlatRow[] {
  const baseSr = String(index);
  const subPath = [leaf.vesselName, ...leaf.pathParts].join(" > ");
  const groupKey = `${leaf.vesselName}||${leaf.group}||${leaf.category}||${subPath}`;
  const suffixes = "abcdefghijklmnopqrstuvwxyz";
  const canUpload = leaf.folder.upload || leaf.folder.month_driven;

  if (leaf.files.length === 0) {
    return [{
      srNo: baseSr,
      vesselName: leaf.vesselName,
      group: leaf.group,
      category: leaf.category,
      subFolderPath: subPath,
      fileName: null,
      fileId: null,
      fileNode: null,
      groupKey,
      uploadFolderId: leaf.folder.id,
      monthDriven: leaf.folder.month_driven,
      canUpload,
    }];
  }

  return leaf.files.map((f, idx) => ({
    srNo: idx === 0 ? baseSr : `${baseSr}${suffixes[idx - 1]}`,
    vesselName: leaf.vesselName,
    group: leaf.group,
    category: leaf.category,
    subFolderPath: subPath,
    fileName: f.name,
    fileId: f.id,
    fileNode: f,
    groupKey,
    uploadFolderId: leaf.folder.id,
    monthDriven: leaf.folder.month_driven,
    canUpload,
  }));
}

async function walkFolder(
  node: FolderNode,
  vesselName: string,
  pathParts: string[],
  signal: AbortSignal,
  emitLeaf: (leaf: LeafEntry) => void
): Promise<void> {
  if (signal.aborted) return;

  let kids: FolderNode[];
  try {
    kids = await getChildren(node.id, signal);
  } catch {
    return;
  }

  if (signal.aborted) return;

  const files = kids.filter((k) => k.kind === "file");
  const subFolders = kids.filter((k) => k.kind !== "file");
  const group = pathParts[0] ?? node.name;
  const category = pathParts[1] ?? node.name;

  if (files.length > 0 || subFolders.length === 0) {
    emitLeaf({ vesselName, group, category, pathParts, files, folder: node });
  }

  if (subFolders.length > 0) {
    await mapLimit(
      subFolders,
      FETCH_CONCURRENCY,
      async (sf) => walkFolder(sf, vesselName, [...pathParts, sf.name], signal, emitLeaf)
    );
  }
}

async function flattenMainFolderProgress(
  mainFolderId: string,
  signal: AbortSignal,
  onAppendRows: (rows: FlatRow[]) => void,
  onVesselsResolved?: (vesselNames: string[]) => void
): Promise<FlatRow[]> {
  const top = await getChildren(mainFolderId, signal);
  if (signal.aborted) return [];

  let srCounter = 0;

  const isFlat = !top.some((n) => n.kind === "ship");
  if (isFlat) {
    onVesselsResolved?.(["Kaizen - Knowledge Bank"]);
    const finalRows: FlatRow[] = [];

    const emitLeaf = (leaf: LeafEntry) => {
      srCounter += 1;
      const nextRows = leafToRows(leaf, srCounter);
      finalRows.push(...nextRows);
      onAppendRows(nextRows);
    };

    const folderGroups = top.filter((g) => g.kind !== "file");
    await mapLimit(folderGroups, FETCH_CONCURRENCY, async (g) => {
      if (signal.aborted) return;
      let subCats: FolderNode[] = [];
      try {
        subCats = await getChildren(g.id, signal);
      } catch {
        return;
      }
      if (signal.aborted) return;

      const subFolders = subCats.filter((sf) => sf.kind !== "file");
      const files = subCats.filter((f) => f.kind === "file");

      if (subFolders.length === 0) {
        emitLeaf({
          vesselName: "Kaizen - Knowledge Bank",
          group: g.name,
          category: g.name,
          pathParts: [g.name],
          files,
          folder: g
        });
      } else {
        await mapLimit(subFolders, FETCH_CONCURRENCY, async (sf) => {
          if (signal.aborted) return;
          await walkFolder(sf, "Kaizen - Knowledge Bank", [g.name, sf.name], signal, emitLeaf);
        });
      }
    });

    return finalRows;
  }

  const ships = top.filter((n) => n.kind === "ship");
  onVesselsResolved?.(ships.map((s) => s.name).sort((a, b) => a.localeCompare(b)));
  const finalRows: FlatRow[] = [];

  const emitLeaf = (leaf: LeafEntry) => {
    srCounter += 1;
    const nextRows = leafToRows(leaf, srCounter);
    finalRows.push(...nextRows);
    onAppendRows(nextRows);
  };

  await mapLimit(ships, FETCH_CONCURRENCY, async (ship) => {
    if (signal.aborted) return;

    let groups: FolderNode[] = [];
    try {
      groups = await getChildren(ship.id, signal);
    } catch {
      return;
    }

    if (signal.aborted) return;

    const folderGroups = groups.filter((g) => g.kind !== "file");
    await mapLimit(folderGroups, FETCH_CONCURRENCY, async (g) => {
      if (signal.aborted) return;

      let kids: FolderNode[] = [];
      try {
        kids = await getChildren(g.id, signal);
      } catch {
        return;
      }

      if (signal.aborted) return;
      const cats = kids.filter((c) => c.kind !== "file");
      const files = kids.filter((c) => c.kind === "file");

      if (cats.length === 0) {
        emitLeaf({
          vesselName: ship.name,
          group: g.name,
          category: g.name,
          pathParts: [g.name],
          files,
          folder: g,
        });
        return;
      }

      await mapLimit(
        cats,
        FETCH_CONCURRENCY,
        async (cat) => walkFolder(cat, ship.name, [g.name, cat.name], signal, emitLeaf)
      );
    });
  });

  return finalRows;
}

export function MainFolderListView({ mainFolderId, mainFolderName, onPreviewFile, onDeleteFile }: Props) {
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [allVessels, setAllVessels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [uploadingGroupKey, setUploadingGroupKey] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());

  const [textFilter, setTextFilter] = useState("");
  const [vesselFilter, setVesselFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [sort, setSort] = useState<"name_asc" | "name_desc" | "group_asc">("group_asc");
  const [visibleVesselCount, setVisibleVesselCount] = useState(VESSEL_PAGE_SIZE);

  useEffect(() => {
    setVisibleVesselCount(VESSEL_PAGE_SIZE);
  }, [mainFolderId]);

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const cachedRows = mainRowsCache.get(mainFolderId);
    if (cachedRows && cachedRows.length > 0) {
      setRows(cachedRows);
      setAllVessels(Array.from(new Set(cachedRows.map((r) => r.vesselName))).sort((a, b) => a.localeCompare(b)));
      setLoading(true);
    } else {
      setRows([]);
      setAllVessels([]);
      setLoading(true);
    }
    setError(null);
    setSelectedFileIds(new Set());
    const liveRows: FlatRow[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushLiveRows = () => {
      flushTimer = null;
      if (controller.signal.aborted) return;
      const snapshot = [...liveRows];
      mainRowsCache.set(mainFolderId, snapshot);
      setRows(snapshot);
    };

    const queueFlush = () => {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(flushLiveRows, 80);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30_000);

    flattenMainFolderProgress(
      mainFolderId,
      controller.signal,
      (chunk) => {
        if (!controller.signal.aborted && chunk.length > 0) {
          liveRows.push(...chunk);
          queueFlush();
        }
      },
      (vesselNames) => {
        if (!controller.signal.aborted) {
          setAllVessels(vesselNames);
        }
      }
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushLiveRows();
          }
          if (r.length === 0 && (!cachedRows || cachedRows.length === 0)) setRows([]);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (controller.signal.aborted) {
          if (timedOut) {
            if (flushTimer !== null) {
              clearTimeout(flushTimer);
              flushLiveRows();
            }
            setError("List view timed out while loading folders. Showing partial results.");
            setLoading(false);
          }
          return;
        }
        if (!controller.signal.aborted) {
          if (flushTimer !== null) {
            clearTimeout(flushTimer);
            flushLiveRows();
          }
          setError(e?.message ?? "Failed to load document list.");
          setLoading(false);
        }
      })
      .finally(() => clearTimeout(timer));

    return () => {
      controller.abort();
      if (flushTimer !== null) clearTimeout(flushTimer);
      clearTimeout(timer);
    };
  }, [mainFolderId, reloadKey]);

  const vessels = useMemo(
    () => (allVessels.length > 0 ? allVessels : Array.from(new Set(rows.map((r) => r.vesselName))).sort((a, b) => a.localeCompare(b))),
    [allVessels, rows]
  );
  const vesselsWithData = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.vesselName))).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const visibleVesselNames = useMemo(
    () => new Set(vesselsWithData.slice(0, visibleVesselCount)),
    [vesselsWithData, visibleVesselCount]
  );
  const groups = useMemo(() => Array.from(new Set(rows.map((r) => r.group))).sort(), [rows]);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((r) =>
              (vesselFilter === "all" || r.vesselName === vesselFilter) &&
              (groupFilter === "all" || r.group === groupFilter)
            )
            .map((r) => r.category)
        )
      ).sort(),
    [rows, vesselFilter, groupFilter]
  );

  const filtered = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    let out = rows;
    if (vesselFilter !== "all") {
      out = out.filter((r) => r.vesselName === vesselFilter);
    } else if (!q) {
      // Default main-folder list mode shows first vessels in batches.
      out = out.filter((r) => visibleVesselNames.has(r.vesselName));
    }
    if (groupFilter !== "all") out = out.filter((r) => r.group === groupFilter);
    if (catFilter !== "all") out = out.filter((r) => r.category === catFilter);
    if (q) {
      out = out.filter(
        (r) =>
          r.vesselName.toLowerCase().includes(q) ||
          r.group.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.subFolderPath.toLowerCase().includes(q) ||
          (r.fileName ?? "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, textFilter, vesselFilter, groupFilter, catFilter, visibleVesselNames]);

  const canShowMoreVessels = vesselFilter === "all" && textFilter.trim() === "" && visibleVesselCount < vesselsWithData.length;
  const canShowLessVessels = vesselFilter === "all" && textFilter.trim() === "" && visibleVesselCount > VESSEL_PAGE_SIZE;

  const groupedRows = useMemo(() => {
    const map = new Map<string, {
      srNo: string;
      vesselName: string;
      group: string;
      category: string;
      subFolderPath: string;
      groupKey: string;
      uploadFolderId: string;
      monthDriven: boolean;
      canUpload: boolean;
      files: Array<{ id: string; name: string; node: FolderNode }>;
    }>();

    for (const row of filtered) {
      const existing = map.get(row.groupKey);
      if (!existing) {
        map.set(row.groupKey, {
          srNo: row.srNo,
          vesselName: row.vesselName,
          group: row.group,
          category: row.category,
          subFolderPath: row.subFolderPath,
          groupKey: row.groupKey,
          uploadFolderId: row.uploadFolderId,
          monthDriven: row.monthDriven,
          canUpload: row.canUpload,
          files: row.fileId && row.fileName && row.fileNode ? [{ id: row.fileId, name: row.fileName, node: row.fileNode }] : [],
        });
      } else if (row.fileId && row.fileName && row.fileNode) {
        existing.files.push({ id: row.fileId, name: row.fileName, node: row.fileNode });
      }
    }

    const grouped = Array.from(map.values());
    for (const g of grouped) {
      g.files.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (sort === "group_asc") return grouped;

    const keyFor = (g: (typeof grouped)[number]) => g.files[0]?.name?.toLowerCase() ?? "";
    grouped.sort((a, b) => {
      const ka = keyFor(a);
      const kb = keyFor(b);
      if (!ka && !kb) return 0;
      if (!ka) return 1;
      if (!kb) return -1;
      return sort === "name_asc" ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });

    return grouped;
  }, [filtered, sort]);

  const selectedFileNodes = useMemo(() => {
    const picked: FolderNode[] = [];
    for (const row of rows) {
      if (row.fileId && row.fileNode && selectedFileIds.has(row.fileId)) {
        picked.push(row.fileNode);
      }
    }
    return picked;
  }, [rows, selectedFileIds]);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const toggleFileSelection = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const handleAttachUpload = async (row: UploadTarget, files: File[]) => {
    if (!files.length) return;
    setUploadingGroupKey(row.groupKey);
    setUploadError(null);
    setUploadInfo(files.length === 1 ? `Uploading ${files[0].name}...` : `Uploading ${files.length} files...`);

    let doneCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    try {
      for (const file of files) {
        const job = row.monthDriven
          ? await monthUpload(row.uploadFolderId, file)
          : await uploadFile(row.uploadFolderId, file);

        let final = job;
        for (let i = 0; i < 10 && final.status === "processing"; i++) {
          await sleep(500);
          final = await getJob(job.id);
        }

        if (final.status === "done") doneCount += 1;
        else if (final.status === "pending") pendingCount += 1;
        else failedCount += 1;
      }

      if (failedCount === 0) {
        if (pendingCount > 0) {
          setUploadInfo(`${doneCount} uploaded and ${pendingCount} sent for approval.`);
        } else {
          setUploadInfo(doneCount === 1 ? "Attachment uploaded successfully." : `${doneCount} attachments uploaded successfully.`);
        }
      } else {
        setUploadError(`${failedCount} file(s) failed. Uploaded: ${doneCount}, Pending approval: ${pendingCount}.`);
      }

      setRows([]);
      setSelectedFileIds(new Set());
      setReloadKey((k) => k + 1);
    } catch (err) {
      const errMsg = (err as any)?.response?.data?.detail;
      setUploadError(typeof errMsg === "string" ? errMsg : "Upload failed. Please retry.");
    } finally {
      setUploadingGroupKey(null);
    }
  };

  const fileCount = rows.filter((r) => r.fileId !== null).length;
  const catCount = new Set(rows.map((r) => `${r.vesselName}::${r.category}`)).size;

  if (loading && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted">Building document list for {mainFolderName}...</p>
        <p className="text-xs text-muted/60">Loading folders in batches...</p>
      </div>
    );
  }

  if (error && rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertCircle className="h-8 w-8 text-rose-400" />
        <p className="text-sm text-rose-600 font-medium">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            setRows([]);
            setReloadKey((k) => k + 1);
          }}
          className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-fg hover:bg-surface2 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0">
      {loading && rows.length > 0 && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700">
          Loading more folders... current rows are visible.
        </p>
      )}
      {uploadInfo && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
          {uploadInfo}
        </p>
      )}
      {uploadError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          {uploadError}
        </p>
      )}

      <p className="text-xs text-muted">
        {vessels.length} vessel{vessels.length !== 1 ? "s" : ""} - {groups.length} group{groups.length !== 1 ? "s" : ""} - {catCount} categor{catCount !== 1 ? "ies" : "y"} - {fileCount} file{fileCount !== 1 ? "s" : ""} with attachments
      </p>

      <div className="dms-sticky-filter-bar flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          <div className="relative w-60 min-w-[150px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
            <input
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              placeholder="Filter by vessel, group, category, folder path..."
              className="dms-input w-full py-1 pl-8 pr-2.5 text-xs text-fg"
            />
          </div>
          <select value={vesselFilter} onChange={(e) => setVesselFilter(e.target.value)} className="dms-input rounded-lg px-2 py-1 text-[11px] text-muted max-w-[130px] truncate">
            <option value="all">All vessels</option>
            {vessels.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setCatFilter("all"); }} className="dms-input rounded-lg px-2 py-1 text-[11px] text-muted max-w-[130px] truncate">
            <option value="all">All groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="dms-input rounded-lg px-2 py-1 text-[11px] text-muted max-w-[130px] truncate">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="dms-input rounded-lg px-2 py-1 text-[11px] text-muted max-w-[130px] truncate">
            <option value="group_asc">Default order</option>
            <option value="name_asc">Name A-Z</option>
            <option value="name_desc">Name Z-A</option>
          </select>
        </div>

        {onDeleteFile && (
          <div className="flex-shrink-0">
            <button
              onClick={() => {
                if (selectedFileNodes.length !== 1) return;
                onDeleteFile(selectedFileNodes[0]);
              }}
              disabled={selectedFileNodes.length !== 1}
              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition disabled:cursor-not-allowed disabled:opacity-50"
              title={selectedFileNodes.length === 1 ? `Delete ${selectedFileNodes[0].name}` : "Select exactly one file to delete"}
            >
              <Trash2 className="h-3 w-3" />
              {selectedFileNodes.length === 1 ? "Delete selected file" : "Delete file (select 1)"}
            </button>
          </div>
        )}
      </div>
      {groupedRows.length === 0 ? (
        <p className="dms-card rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
          {rows.length === 0 ? "No documents found in this main folder." : "No documents match your filter."}
        </p>
      ) : (
        <div className="flex-1 overflow-auto rounded-xl border border-border bg-surface min-h-[440px]">
          <table className="w-full text-sm" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr className="border-b border-border bg-surface2 text-left">
                <th className="dms-sticky-th px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted w-14 border-l border-r border-border">Sr.</th>
                <th className="dms-sticky-th px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted border-r border-border">Vessel Name</th>
                <th className="dms-sticky-th px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted border-r border-border">Group</th>
                <th className="dms-sticky-th px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted border-r border-border">Sub-category</th>
                <th className="dms-sticky-th px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted border-r border-border">Folder path</th>
                <th className="dms-sticky-th px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted border-r border-border">File name</th>
                <th className="dms-sticky-th px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted text-right border-r border-border">Attachment</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((row, idx) => {
                const selectedInRow = row.files.filter((f) => selectedFileIds.has(f.id));
                const openTargets = selectedInRow.length > 0 ? selectedInRow : row.files;

                return (
                  <tr key={`${row.groupKey}-${idx}`} className="border-t border-border transition hover:bg-bg">
                    <td className="px-3 py-2 text-xs text-muted font-mono whitespace-nowrap align-top border-l border-r border-border">{row.srNo}</td>
                    <td className="px-3 py-2 text-sm text-fg font-semibold align-top border-r border-border">{row.vesselName}</td>
                    <td className="px-3 py-2 align-top border-r border-border">{row.group}</td>
                    <td className="px-3 py-2 text-sm text-fg font-medium align-top border-r border-border">{row.category}</td>
                    <td className="px-3 py-2 text-xs text-muted align-top border-r border-border max-w-sm">
                      <span className="block" title={row.subFolderPath}>{row.subFolderPath}</span>
                    </td>
                    <td className="px-3 py-2 text-sm text-fg max-w-md align-top border-r border-border">
                      {row.files.length > 0 ? (
                        <div className="space-y-1.5">
                          {row.files.map((f) => (
                            <div key={f.id} className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={selectedFileIds.has(f.id)}
                                onChange={() => toggleFileSelection(f.id)}
                                className="mt-0.5 h-3.5 w-3.5 rounded border-border cursor-pointer"
                              />
                              <span
                                onClick={() => {
                                  if (onPreviewFile) {
                                    onPreviewFile(f.node);
                                  } else {
                                    window.open(fileContentUrl(f.id), "_blank");
                                  }
                                }}
                                className="block truncate hover:underline cursor-pointer select-none text-fg"
                                title={f.name}
                              >
                                {f.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted italic text-xs">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top border-r border-border">
                      <div className="flex flex-col items-end gap-1.5">
                        {row.files.length > 0 ? (
                          <button
                            onClick={() => {
                              const target = openTargets[0];
                              if (!target) return;
                              if (onPreviewFile) {
                                onPreviewFile(target.node);
                                return;
                              }
                              window.location.href = fileContentUrl(target.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {selectedInRow.length > 0
                              ? `Open selected (${selectedInRow.length})`
                              : `Open (${row.files.length})`}
                          </button>
                        ) : (
                          <span className="text-xs text-muted italic">No attachment</span>
                        )}

                        {row.canUpload && (
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-fg hover:bg-surface2 transition">
                            <input
                              type="file"
                              multiple
                              className="hidden"
                              disabled={uploadingGroupKey === row.groupKey}
                              onChange={(e) => {
                                const nextFiles = Array.from(e.target.files || []);
                                e.currentTarget.value = "";
                                if (nextFiles.length === 0) return;
                                void handleAttachUpload(row, nextFiles);
                              }}
                            />
                            {uploadingGroupKey === row.groupKey ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Uploading
                              </>
                            ) : (
                              <>
                                <Upload className="h-3 w-3" />
                                Upload files
                              </>
                            )}
                          </label>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {vesselFilter === "all" && textFilter.trim() === "" && vesselsWithData.length > VESSEL_PAGE_SIZE && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2">
          <p className="text-xs text-muted">
            Showing {Math.min(visibleVesselCount, vesselsWithData.length)} of {vesselsWithData.length} vessels
          </p>
          <div className="flex items-center gap-2">
            {canShowMoreVessels && (
              <button
                onClick={() => setVisibleVesselCount(vesselsWithData.length)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                More vessels
              </button>
            )}
            {canShowLessVessels && (
              <button
                onClick={() => setVisibleVesselCount(VESSEL_PAGE_SIZE)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
