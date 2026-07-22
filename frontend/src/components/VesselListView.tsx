import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, AlertCircle } from "lucide-react";
import { getChildren, fileContentUrl, type FolderNode } from "../api";

// ── Types ────────────────────────────────────────────────────────────────────

interface FlatRow {
  srNo: string;
  group: string;
  category: string;
  subFolderPath: string;
  fileName: string | null;
  fileId: string | null;
  groupKey: string;
}

interface LeafEntry {
  group: string;
  category: string;
  pathParts: string[];
  files: FolderNode[];
}

// ── Parallel recursive flattener ─────────────────────────────────────────────
// All sibling folders are fetched in parallel via Promise.all to avoid
// the O(n) sequential round-trip problem.

async function walkFolder(
  node: FolderNode,
  pathParts: string[],
  signal: AbortSignal
): Promise<LeafEntry[]> {
  if (signal.aborted) return [];

  let kids: FolderNode[];
  try {
    kids = await getChildren(node.id);
  } catch {
    return [];
  }

  if (signal.aborted) return [];

  const files = kids.filter((k) => k.kind === "file");
  const subFolders = kids.filter((k) => k.kind !== "file");

  const group = pathParts[0] ?? node.name;
  const category = pathParts[1] ?? node.name;

  const results: LeafEntry[] = [];

  // This node is a leaf if it has files OR has no sub-folders
  if (files.length > 0 || subFolders.length === 0) {
    results.push({ group, category, pathParts, files });
  }

  // Recurse into all sub-folders IN PARALLEL
  if (subFolders.length > 0) {
    const nested = await Promise.all(
      subFolders.map((sf) => walkFolder(sf, [...pathParts, sf.name], signal))
    );
    for (const n of nested) results.push(...n);
  }

  return results;
}

async function flattenVessel(vesselId: string, signal: AbortSignal): Promise<FlatRow[]> {
  // Level 1: groups (parallel)
  const groups = await getChildren(vesselId);
  if (signal.aborted) return [];

  const folderGroups = groups.filter((g) => g.kind !== "file");

  // Level 2: categories for all groups (parallel)
  const groupCategoryPairs = await Promise.all(
    folderGroups.map(async (g) => {
      try {
        const cats = await getChildren(g.id);
        return { group: g, cats: cats.filter((c) => c.kind !== "file") };
      } catch {
        return { group: g, cats: [] };
      }
    })
  );
  if (signal.aborted) return [];

  // Level 3+: walk all categories in parallel
  const allLeaves: LeafEntry[] = [];
  await Promise.all(
    groupCategoryPairs.flatMap(({ group, cats }) =>
      cats.map(async (cat) => {
        const leaves = await walkFolder(cat, [group.name, cat.name], signal);
        allLeaves.push(...leaves);
      })
    )
  );
  if (signal.aborted) return [];

  // Assign Sr. numbers and build rows
  const rows: FlatRow[] = [];
  let srCounter = 0;
  const suffixes = "abcdefghijklmnopqrstuvwxyz";

  for (const leaf of allLeaves) {
    srCounter++;
    const baseSr = String(srCounter);
    const subPath = leaf.pathParts.join(" › ");
    const groupKey = `${leaf.group}||${leaf.category}||${subPath}`;

    if (leaf.files.length === 0) {
      rows.push({ srNo: baseSr, group: leaf.group, category: leaf.category, subFolderPath: subPath, fileName: null, fileId: null, groupKey });
    } else {
      leaf.files.forEach((f, idx) => {
        rows.push({
          srNo: idx === 0 ? baseSr : `${baseSr}${suffixes[idx - 1]}`,
          group: leaf.group,
          category: leaf.category,
          subFolderPath: subPath,
          fileName: f.name,
          fileId: f.id,
          groupKey,
        });
      });
    }
  }

  return rows;
}

// ── Group color palette ──────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, { bg: string; text: string }> = {
  Electrical: { bg: "bg-orange-100", text: "text-orange-700" },
  Hull: { bg: "bg-blue-100", text: "text-blue-700" },
  Machinery: { bg: "bg-purple-100", text: "text-purple-700" },
  "Technical & Crewing": { bg: "bg-orange-100", text: "text-orange-700" },
  "Commercial & Chartering": { bg: "bg-emerald-100", text: "text-emerald-700" },
  Insurance: { bg: "bg-amber-100", text: "text-amber-700" },
};

function groupBadge(name: string) {
  const c = GROUP_COLORS[name] ?? { bg: "bg-slate-100", text: "text-slate-700" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${c.bg} ${c.text}`}>
      {name}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  vesselId: string;
  vesselName: string;
}

export function VesselListView({ vesselId, vesselName }: Props) {
  const [rows, setRows] = useState<FlatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [textFilter, setTextFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [sort, setSort] = useState<"name_asc" | "name_desc" | "group_asc">("group_asc");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setRows([]);

    // 30-second timeout guard
    const timer = setTimeout(() => controller.abort(), 30_000);

    flattenVessel(vesselId, controller.signal)
      .then((r) => {
        if (!controller.signal.aborted) {
          setRows(r);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e?.message ?? "Failed to load document list.");
          setLoading(false);
        }
      })
      .finally(() => clearTimeout(timer));

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [vesselId]);

  const groups = useMemo(() => Array.from(new Set(rows.map((r) => r.group))).sort(), [rows]);
  const categories = useMemo(
    () =>
      Array.from(
        new Set(rows.filter((r) => groupFilter === "all" || r.group === groupFilter).map((r) => r.category))
      ).sort(),
    [rows, groupFilter]
  );

  const filtered = useMemo(() => {
    const q = textFilter.trim().toLowerCase();
    let out = rows;
    if (groupFilter !== "all") out = out.filter((r) => r.group === groupFilter);
    if (catFilter !== "all") out = out.filter((r) => r.category === catFilter);
    if (q)
      out = out.filter(
        (r) =>
          r.group.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.subFolderPath.toLowerCase().includes(q) ||
          (r.fileName ?? "").toLowerCase().includes(q)
      );
    if (sort === "name_asc") return [...out].sort((a, b) => (a.fileName ?? "").localeCompare(b.fileName ?? ""));
    if (sort === "name_desc") return [...out].sort((a, b) => (b.fileName ?? "").localeCompare(a.fileName ?? ""));
    return out;
  }, [rows, textFilter, groupFilter, catFilter, sort]);

  // Rowspan map: index → span count (0 = not a group-start row)
  const rowspanMap = useMemo(() => {
    const map: number[] = new Array(filtered.length).fill(0);
    let i = 0;
    while (i < filtered.length) {
      const key = filtered[i].groupKey;
      let j = i;
      while (j < filtered.length && filtered[j].groupKey === key) j++;
      map[i] = j - i;
      i = j;
    }
    return map;
  }, [filtered]);

  const fileCount = rows.filter((r) => r.fileId !== null).length;
  const catCount = new Set(rows.map((r) => r.category)).size;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted">Building document list for {vesselName}…</p>
        <p className="text-xs text-muted/60">Fetching all folders in parallel…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <AlertCircle className="h-8 w-8 text-rose-400" />
        <p className="text-sm text-rose-600 font-medium">{error}</p>
        <button
          onClick={() => { setLoading(true); setError(null); }}
          className="rounded-lg border border-border px-4 py-2 text-xs font-semibold text-fg hover:bg-surface2 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        {groups.length} group{groups.length !== 1 ? "s" : ""} · {catCount} categor{catCount !== 1 ? "ies" : "y"} · {fileCount} file{fileCount !== 1 ? "s" : ""} with attachments · flattened list view
      </p>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Filter by group, category, sub-folder or file name…"
            className="dms-input w-full py-1.5 pl-9 pr-3 text-sm text-fg"
          />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => { setGroupFilter(e.target.value); setCatFilter("all"); }}
          className="dms-input rounded-lg px-2.5 py-1.5 text-xs text-muted"
        >
          <option value="all">All groups</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="dms-input rounded-lg px-2.5 py-1.5 text-xs text-muted"
        >
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="dms-input rounded-lg px-2.5 py-1.5 text-xs text-muted"
        >
          <option value="group_asc">Default order</option>
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="dms-card rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
          {rows.length === 0 ? "No documents found in this vessel." : "No documents match your filter."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface2 text-left">
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted w-14">Sr.</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Group</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Category</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Sub-folder path</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">File name</th>
                <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted text-right">Attachment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const span = rowspanMap[idx];
                const isGroupStart = span > 0;
                const isGrouped = !isGroupStart;

                return (
                  <tr
                    key={`${row.groupKey}-${idx}`}
                    className={
                      "transition " +
                      (isGrouped ? "bg-surface2/40" : "border-t border-border hover:bg-bg")
                    }
                  >
                    <td className="px-3 py-2 text-xs text-muted font-mono whitespace-nowrap">{row.srNo}</td>

                    {isGroupStart && (
                      <td rowSpan={span} className="px-3 py-2 align-top border-r border-border">
                        {groupBadge(row.group)}
                      </td>
                    )}
                    {isGroupStart && (
                      <td rowSpan={span} className="px-3 py-2 text-sm text-fg font-medium align-top border-r border-border">
                        {row.category}
                      </td>
                    )}
                    {isGroupStart && (
                      <td rowSpan={span} className="px-3 py-2 text-xs text-muted align-top border-r border-border max-w-[220px]">
                        <span className="block" title={row.subFolderPath}>{row.subFolderPath}</span>
                      </td>
                    )}

                    <td className="px-3 py-2 text-sm text-fg max-w-[200px]">
                      {row.fileName
                        ? <span className="block truncate" title={row.fileName}>{row.fileName}</span>
                        : <span className="text-muted italic text-xs">—</span>}
                    </td>

                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {row.fileId ? (
                        <a
                          href={fileContentUrl(row.fileId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/20 transition"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-muted italic">No attachment</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
