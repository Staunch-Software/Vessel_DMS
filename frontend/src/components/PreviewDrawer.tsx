import { Download, ExternalLink, X } from "lucide-react";
import { fileContentUrl, type FolderNode } from "../api";
import { fileMeta, formatDate, formatSize } from "./fileType";

export function PreviewDrawer({
  file,
  onClose,
}: {
  file: FolderNode | null;
  onClose: () => void;
}) {
  if (!file) return null;
  const meta = fileMeta(file.ext);
  const url = fileContentUrl(file.id);

  return (
    <div className="fixed inset-0 z-40 flex sm:justify-end bg-fg/40" onClick={onClose}>
      <div
        className="dms-card flex w-full flex-col rounded-none border-border bg-surface shadow-2xl sm:h-full sm:max-w-3xl sm:border-l"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-3.5">
          <meta.Icon className={"h-5 w-5 shrink-0 " + meta.cls} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{file.name}</p>
            <p className="text-xs text-subtle">
              {[meta.label, formatSize(file.size), formatDate(file.modified)]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-2 text-muted transition hover:bg-surface2"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={url}
            download={file.name}
            className="rounded-md p-2 text-muted transition hover:bg-surface2"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted transition hover:bg-surface2"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto bg-surface2">
          {meta.previewable ? (
            file.ext === "pdf" ? (
              <iframe title={file.name} src={url} className="h-full w-full border-0" />
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <img
                  src={url}
                  alt={file.name}
                  className="max-h-full max-w-full rounded shadow"
                />
              </div>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <meta.Icon className={"h-14 w-14 " + meta.cls} />
              <p className="text-sm text-muted">
                Preview isn't available for {meta.label} files.
              </p>
              <a
                href={url}
                download={file.name}
                className="dms-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
