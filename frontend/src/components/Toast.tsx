import { CheckCircle2, FileWarning, Clock3, Loader2, X, Copy } from "lucide-react";

export interface ToastItem {
  id: number;
  status: "processing" | "done" | "failed" | "pending";
  title: string;
  detail?: string;
  detectedMonth?: string | null;
}

const isDuplicateError = (detail?: string) =>
  !!detail && (detail.toLowerCase().includes("already exists") || detail.toLowerCase().includes("duplicate"));

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex flex-col gap-2 sm:bottom-5 sm:left-auto sm:right-5 sm:w-96 sm:max-w-[calc(100vw-2.5rem)]">
      {toasts.map((t) => {
        const isDuplicate = t.status === "failed" && isDuplicateError(t.detail);
        
        // Colors & classes matching our design system
        const cardClass = isDuplicate 
          ? "border-amber-200 bg-amber-50 shadow-amber-900/10 ring-amber-100"
          : "border-border bg-surface text-fg shadow-lg";

        const titleColor = isDuplicate ? "text-amber-800" : "text-fg";
        const detailColor = isDuplicate ? "text-amber-700" : "text-muted";
        
        return (
          <div
            key={t.id}
            className={`dms-card flex items-start gap-3 rounded-xl border p-4 shadow-md transition-all ${cardClass}`}
          >
            <div className="mt-0.5 shrink-0">
              {t.status === "processing" && (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              {t.status === "done" && (
                <CheckCircle2 className="h-5 w-5 text-success" />
              )}
              {t.status === "pending" && (
                <Clock3 className="h-5 w-5 text-warning" />
              )}
              {t.status === "failed" && isDuplicate && (
                <Copy className="h-5 w-5 text-amber-500" />
              )}
              {t.status === "failed" && !isDuplicate && (
                <FileWarning className="h-5 w-5 text-error" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${titleColor}`}>
                {isDuplicate ? "Duplicate File" : t.title}
              </p>
              {t.detectedMonth && (
                <p className="mt-0.5 text-xs text-accent">
                  Detected month: {t.detectedMonth}
                </p>
              )}
              {t.detail && (
                <p className={`mt-0.5 break-words text-xs ${detailColor}`}>
                  {t.detail}
                </p>
              )}
            </div>

            <button
              onClick={() => onDismiss(t.id)}
              className={
                "rounded p-1 transition shrink-0 " +
                (isDuplicate
                  ? "text-amber-400 hover:bg-amber-100 hover:text-amber-600"
                  : "text-subtle hover:bg-surface2 hover:text-muted")
              }
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
