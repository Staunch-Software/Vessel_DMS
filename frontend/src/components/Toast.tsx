import { CheckCircle2, FileWarning, Loader2, X } from "lucide-react";

export interface ToastItem {
  id: number;
  status: "processing" | "done" | "failed";
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
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/10 ring-1 ring-black/5"
        >
          <div className="mt-0.5">
            {t.status === "processing" && (
              <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
            )}
            {t.status === "done" && (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
            {t.status === "failed" && (
              <FileWarning className="h-5 w-5 text-rose-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">{t.title}</p>
            {t.detectedMonth && (
              <p className="mt-0.5 text-xs text-violet-600">
                Detected month: {t.detectedMonth}
              </p>
            )}
            {t.detail && (
              <p className="mt-0.5 break-words text-xs text-slate-500">
                {t.detail}
              </p>
            )}
          </div>
          <button
            onClick={() => onDismiss(t.id)}
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
