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
  "dms-input flex-1 rounded-lg px-2.5 py-1.5 text-xs text-muted min-w-0";

export function FolderToolbar({
  query, setQuery, typeKey, setTypeKey, sort, setSort, view, setView,
}: Props) {
  return (
    <div className="dms-folder-toolbar mb-4 flex w-full flex-wrap items-center gap-2">
      {/* Search — always full width on mobile */}
      <div className="relative w-full sm:flex-1 sm:min-w-45">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter in this folder…"
          className="dms-input w-full py-1.5 pl-9 pr-3 text-sm text-fg"
        />
      </div>

      {/* Filter + sort row — inline on mobile */}
      <div className="toolbar-row flex w-full gap-2 sm:w-auto sm:flex-none">
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

        <div className="flex shrink-0 overflow-hidden rounded-lg border border-border bg-surface">
          <button
            onClick={() => setView("grid")}
            className={"p-1.5 " + (view === "grid" ? "bg-primary/10 text-primary" : "bg-surface text-subtle hover:bg-bg")}
            title="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={"border-l border-border p-1.5 " + (view === "list" ? "bg-primary/10 text-primary" : "bg-surface text-subtle hover:bg-bg")}
            title="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
