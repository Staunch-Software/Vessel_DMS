import { ChevronRight, Home } from "lucide-react";

export interface Crumb {
  id: string | null; // null = Home
  name: string;
}

export function Breadcrumb({
  crumbs,
  onNavigate,
}: {
  crumbs: Crumb[];
  onNavigate: (index: number) => void;
}) {
  // On mobile, collapse middle crumbs and show only first + last 2
  const total = crumbs.length;
  const shouldCollapse = total > 3;
  const visibleOnMobile = shouldCollapse
    ? [crumbs[0], { id: "__ellipsis__", name: "…" }, ...crumbs.slice(-2)]
    : crumbs;

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm overflow-hidden">
      {/* Mobile view: collapsed */}
      <span className="flex sm:hidden items-center gap-1">
        {visibleOnMobile.map((c, i) => {
          const origIdx = c.id === "__ellipsis__" ? -1 : crumbs.findIndex((x) => x.id === c.id);
          const last = origIdx === total - 1;
          if (c.id === "__ellipsis__") {
            return (
              <span key="ellipsis" className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-subtle shrink-0" />
                <span className="text-muted px-1.5">…</span>
              </span>
            );
          }
          return (
            <span key={c.id ?? "home"} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-subtle shrink-0" />}
              <button
                onClick={() => !last && onNavigate(origIdx)}
                disabled={last}
                className={
                  "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition truncate max-w-[8rem] " +
                  (last
                    ? "font-semibold text-fg cursor-default"
                    : "text-muted hover:bg-surface2 hover:text-primary cursor-pointer")
                }
                title={c.name}
              >
                {origIdx === 0 && <Home className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{c.name}</span>
              </button>
            </span>
          );
        })}
      </span>

      {/* Desktop view: full breadcrumb */}
      <span className="hidden sm:flex items-center flex-wrap gap-1">
        {crumbs.map((c, i) => {
          const last = i === total - 1;
          return (
            <span key={c.id ?? "home"} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="h-4 w-4 text-subtle shrink-0" />}
              <button
                onClick={() => !last && onNavigate(i)}
                disabled={last}
                className={
                  "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition max-w-[12rem] " +
                  (last
                    ? "font-semibold text-fg cursor-default"
                    : "text-muted hover:bg-surface2 hover:text-primary cursor-pointer")
                }
                title={c.name}
              >
                {i === 0 && <Home className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{c.name}</span>
              </button>
            </span>
          );
        })}
      </span>
    </nav>
  );
}
