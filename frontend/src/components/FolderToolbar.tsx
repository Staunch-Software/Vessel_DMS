import { LayoutGrid, List, Search } from "lucide-react";

export type SortKey = "name" | "newest" | "size";
export type TypeKey = "all" | "folders" | "pdf" | "images" | "docs" | "sheets";
export type ViewKey = "grid" | "list";

interface Props {
  query: string;
  setQuery: (v: string) => void;
  typeKey: TypeKey;
  setTypeKey: (v: TypeKey) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  view: ViewKey;
  setView: (v: ViewKey) => void;
}

const selCls =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function FolderToolbar({
  query, setQuery, typeKey, setTypeKey, sort, setSort, view, setView,
}: Props) {
  return (
    <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter in this folder…"
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>

      <select value={typeKey} onChange={(e) => setTypeKey(e.target.value as TypeKey)} className={selCls}>
        <option value="all">All types</option>
        <option value="folders">Folders</option>
        <option value="pdf">PDF</option>
        <option value="images">Images</option>
        <option value="docs">Word</option>
        <option value="sheets">Excel</option>
      </select>

      <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selCls}>
        <option value="name">Name (A–Z)</option>
        <option value="newest">Newest</option>
        <option value="size">Size</option>
      </select>

      <div className="flex overflow-hidden rounded-lg border border-slate-200">
        <button
          onClick={() => setView("grid")}
          className={"p-1.5 " + (view === "grid" ? "bg-brand-50 text-brand-600" : "bg-white text-slate-400 hover:bg-slate-50")}
          title="Grid view"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          onClick={() => setView("list")}
          className={"border-l border-slate-200 p-1.5 " + (view === "list" ? "bg-brand-50 text-brand-600" : "bg-white text-slate-400 hover:bg-slate-50")}
          title="List view"
        >
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
