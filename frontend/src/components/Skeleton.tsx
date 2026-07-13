export function FolderGridSkeleton() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4"
          >
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-border" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-border" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Shimmer({ className = "" }: { className?: string }) {
  return <div className={"animate-pulse rounded bg-border " + className} />;
}
