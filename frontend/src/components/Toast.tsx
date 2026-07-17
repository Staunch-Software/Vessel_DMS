import { CheckCircle2, Clock3, FileWarning, Loader2, X } from "lucide-react";

export interface ToastItem {
  id: number;
  status: "processing" | "done" | "failed" | "pending";
  title: string;
  detail?: string;
  detectedMonth?: string | null;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="dms-card flex items-start gap-3 rounded-xl border border-border p-4"
        >
          <div className="mt-0.5">
            {t.status === "processing" && (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {t.status === "done" && (
              <CheckCircle2 className="h-5 w-5 text-success" />
            )}
            {t.status === "failed" && (
              <FileWarning className="h-5 w-5 text-error" />
            )}
            {t.status === "pending" && (
              <Clock3 className="h-5 w-5 text-warning" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{t.title}</p>
            {t.detectedMonth && (
              <p className="mt-0.5 text-xs text-accent">
                Detected month: {t.detectedMonth}
              </p>
            )}
            {t.detail && (
              <p className="mt-0.5 break-words text-xs text-muted">
                {t.detail}
              </p>
            )}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="rounded p-1 text-subtle transition hover:bg-surface2 hover:text-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
