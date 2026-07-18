import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { search, type SearchResult, type Vessel } from "../api";
import { fileMeta } from "./fileType";
import { iconFor } from "./nodeStyle";

type Facet = "all" | "folders" | "files";

export function SearchBar({
  onNavigate,
  vessels,
  vesselId,
  onVesselChange,
  query,
  onQueryChange,
}: {
  onNavigate: (r: SearchResult) => void;
  vessels: Vessel[];
  vesselId: string | null;
  onVesselChange: (vesselId: string | null) => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const [raw, setRaw] = useState<SearchResult[]>([]);
  const [facet, setFacet] = useState<Facet>("all");
  const [open, setOpen] = useState(false);
  const [vesselOpen, setVesselOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const selectedVessel = useMemo(
    () => vessels.find((v) => v.id === vesselId) ?? null,
    [vessels, vesselId]
  );

  const runSearch = async (nextQ: string, nextVesselId: string | null) => {
    const trimmed = nextQ.trim();
    if (!trimmed) {
      setRaw([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      setRaw(await search(trimmed, nextVesselId ?? null));
      setOpen(true);
    } catch {
      setRaw([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setVesselOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Vessel scoping already happened server-side; this only splits by
  // folder/file, same as before.
  const results = useMemo(() => {
    let r = raw;
    if (facet === "folders") r = r.filter((x) => x.kind !== "file");
    if (facet === "files") r = r.filter((x) => x.kind === "file");
    return r;
  }, [raw, facet]);

  const pick = (r: SearchResult) => {
    onNavigate(r);
    setOpen(false);
    onQueryChange("");
  };

  const pickVessel = (nextVesselId: string | null) => {
    onVesselChange(nextVesselId);
    setVesselOpen(false);
    if (query.trim()) void runSearch(query, nextVesselId);
  };

  const chip = (key: Facet, label: string) => (
    <button
      onClick={() => setFacet(key)}
      className={
        "rounded-full px-2.5 py-0.5 text-xs font-medium transition " +
        (facet === key
          ? "bg-primary text-primary-fg"
          : "bg-surface2 text-muted hover:bg-surface-hover")
      }
    >
      {label}
    </button>
  );

  return (
    <div ref={boxRef} className="relative z-40 w-full max-w-3xl">
      <div className="dms-topbar-search grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => raw.length && setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch(query, vesselId);
              }
            }}
            placeholder={selectedVessel ? `Search in ${selectedVessel.name}...` : "Search documents..."}
            className="dms-input dms-search-pill w-full py-2 pl-9 pr-8 text-sm text-fg"
          />
          {query && (
            <button
              onClick={() => {
                onQueryChange("");
                setRaw([]);
                setOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-subtle hover:bg-surface2"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Vessel filter — hidden on mobile, visible on sm+ */}
        <div className="vessel-filter relative hidden sm:block">
          <button
            type="button"
            onClick={() => setVesselOpen((v) => !v)}
            className="dms-input flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-fg"
            title="Filter search by vessel"
          >
            <span className="truncate">{selectedVessel?.name ?? "All Vessels"}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-subtle" />
          </button>

          {vesselOpen && (
            <div className="dms-card absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-surface p-1 shadow-xl">
              <button
                type="button"
                onClick={() => pickVessel(null)}
                className={
                  "w-full rounded-lg px-3 py-2 text-left text-sm transition " +
                  (vesselId === null
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-fg hover:bg-surface-hover")
                }
              >
                All Vessels
              </button>
              {vessels.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => pickVessel(v.id)}
                  className={
                    "w-full rounded-lg px-3 py-2 text-left text-sm transition " +
                    (vesselId === v.id
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-fg hover:bg-surface-hover")
                  }
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search button — hidden on mobile (Enter key triggers search instead), visible on sm+ */}
        <button
          onClick={() => void runSearch(query, vesselId)}
          className="dms-btn-primary hidden rounded-xl px-4 py-2 text-sm font-semibold sm:block"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {open && (
        <div className="dms-card absolute z-40 mt-2 w-full overflow-hidden border border-border bg-surface shadow-xl">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
            {chip("all", "All")}
            {chip("folders", "Folders")}
            {chip("files", "Files")}
            {selectedVessel && (
              <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                {selectedVessel.name} only
              </span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {loading ? (
              <p className="px-4 py-3 text-sm text-muted">Searching...</p>
            ) : results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">
                {selectedVessel
                  ? `No documents found in ${selectedVessel.name}.`
                  : "No documents found."}
              </p>
            ) : (
              results.map((r) => {
                const isFile = r.kind === "file";
                const ext = isFile && r.name.includes(".") ? r.name.split(".").pop() : "";
                const meta = fileMeta(ext);
                const folderIcon = iconFor({
                  ...r, upload: false, month_driven: false, has_children: false,
                });
                const Icon = isFile ? meta.Icon : folderIcon.Icon;
                const cls = isFile ? meta.cls : folderIcon.cls;
                return (
                  <button
                    key={r.id}
                    onClick={() => pick(r)}
                    className="flex w-full items-start gap-3 px-4 py-2 text-left transition hover:bg-bg"
                  >
                    <Icon className={"mt-0.5 h-4 w-4 shrink-0 " + cls} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">{r.name}</span>
                      <span className="block truncate text-xs text-subtle">{r.path}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
