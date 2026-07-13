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
  "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function FolderToolbar({
  query, setQuery, typeKey, setTypeKey, sort, setSort, view, setView,
}: Props) {
  return (
    <div className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter in this folder…"
          className="w-full rounded-lg border border-border bg-surface py-1.5 pl-9 pr-3 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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

      <div className="flex overflow-hidden rounded-lg border border-border">
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
  );
}
