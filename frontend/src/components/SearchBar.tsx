import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { search, type SearchResult } from "../api";
import { fileMeta } from "./fileType";
import { iconFor } from "./nodeStyle";

type Facet = "all" | "folders" | "files";

export function SearchBar({
  onNavigate,
  vesselScope,
}: {
  onNavigate: (r: SearchResult) => void;
  vesselScope: string | null;
}) {
  const [q, setQ] = useState("");
  const [raw, setRaw] = useState<SearchResult[]>([]);
  const [facet, setFacet] = useState<Facet>("all");
  const [scoped, setScoped] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) {
      setRaw([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setRaw(await search(q));
        setOpen(true);
      } catch {
        setRaw([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    let r = raw;
    if (facet === "folders") r = r.filter((x) => x.kind !== "file");
    if (facet === "files") r = r.filter((x) => x.kind === "file");
    if (scoped && vesselScope)
      r = r.filter((x) => x.path.split("/").includes(vesselScope));
    return r;
  }, [raw, facet, scoped, vesselScope]);

  const pick = (r: SearchResult) => {
    onNavigate(r);
    setOpen(false);
    setQ("");
  };

  const chip = (key: Facet, label: string) => (
    <button
      onClick={() => setFacet(key)}
      className={
        "rounded-full px-2.5 py-0.5 text-xs font-medium transition " +
        (facet === key
          ? "bg-brand-600 text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200")
      }
    >
      {label}
    </button>
  );

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => raw.length && setOpen(true)}
          placeholder="Search folders & documents…"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm text-slate-700 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        {q && (
          <button
            onClick={() => { setQ(""); setRaw([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2">
            {chip("all", "All")}
            {chip("folders", "Folders")}
            {chip("files", "Files")}
            {vesselScope && (
              <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={scoped}
                  onChange={(e) => setScoped(e.target.checked)}
                  className="accent-brand-600"
                />
                {vesselScope} only
              </label>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No matches.</p>
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
                    className="flex w-full items-start gap-3 px-4 py-2 text-left transition hover:bg-slate-50"
                  >
                    <Icon className={"mt-0.5 h-4 w-4 shrink-0 " + cls} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{r.name}</span>
                      <span className="block truncate text-xs text-slate-400">{r.path}</span>
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
