import { CheckCircle2, FileWarning, Loader2, X, Copy } from "lucide-react";

export interface ToastItem {
  id: number;
  status: "processing" | "done" | "failed";
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
    <div className="fixed bottom-5 right-5 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-3">
      {toasts.map((t) => {
        const isDuplicate = t.status === "failed" && isDuplicateError(t.detail);
        return (
          <div
            key={t.id}
            className={
              "flex items-start gap-3 rounded-xl border p-4 shadow-lg ring-1 " +
              (isDuplicate
                ? "border-amber-200 bg-amber-50 shadow-amber-900/10 ring-amber-100"
                : "border-slate-200 bg-white shadow-slate-900/10 ring-black/5")
            }
          >
            <div className="mt-0.5">
              {t.status === "processing" && (
                <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
              )}
              {t.status === "done" && (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              )}
              {t.status === "failed" && isDuplicate && (
                <Copy className="h-5 w-5 text-amber-500" />
              )}
              {t.status === "failed" && !isDuplicate && (
                <FileWarning className="h-5 w-5 text-rose-500" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={
                  "text-sm font-semibold " +
                  (isDuplicate ? "text-amber-800" : "text-slate-800")
                }
              >
                {isDuplicate ? "Duplicate File" : t.title}
              </p>
              {t.detectedMonth && (
                <p className="mt-0.5 text-xs text-violet-600">
                  Detected month: {t.detectedMonth}
                </p>
              )}
              {t.detail && (
                <p
                  className={
                    "mt-0.5 break-words text-xs " +
                    (isDuplicate ? "text-amber-700" : "text-slate-500")
                  }
                >
                  {t.detail}
                </p>
              )}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className={
                "rounded p-1 transition " +
                (isDuplicate
                  ? "text-amber-400 hover:bg-amber-100 hover:text-amber-600"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-600")
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
