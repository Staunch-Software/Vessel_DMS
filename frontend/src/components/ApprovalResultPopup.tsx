import { CheckCircle2, XCircle, X, FileCheck2 } from "lucide-react";

export interface ApprovalResultItem {
  id: string;          // approval request ID
  filename: string;
  status: "approved" | "rejected";
  decidedAt: string | null;
  rejectionReason: string | null;
  finalPath: string | null;
}

interface Props {
  items: ApprovalResultItem[];
  onDismiss: (id: string) => void;
}

export function ApprovalResultPopup({ items, onDismiss }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-5 left-1/2 z-[200] flex -translate-x-1/2 flex-col gap-3 sm:left-auto sm:right-5 sm:translate-x-0 w-[calc(100vw-2rem)] sm:w-[380px]">
      {items.map((item) => {
        const approved = item.status === "approved";
        return (
          <div
            key={item.id}
            className={`relative flex items-start gap-3 rounded-2xl border p-4 shadow-xl backdrop-blur-sm ${
              approved
                ? "border-emerald-200 bg-emerald-50"
                : "border-rose-200 bg-rose-50"
            }`}
          >
            {/* Icon */}
            <div
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                approved ? "bg-emerald-100" : "bg-rose-100"
              }`}
            >
              {approved ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <XCircle className="h-5 w-5 text-rose-600" />
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-bold ${
                  approved ? "text-emerald-800" : "text-rose-800"
                }`}
              >
                {approved ? "File Approved \u2713" : "File Rejected \u2717"}
              </p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-slate-600">
                <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="truncate" title={item.filename}>
                  {item.filename}
                </span>
              </p>
              {!approved && item.rejectionReason && (
                <p className="mt-1.5 rounded-lg bg-rose-100 px-2.5 py-1.5 text-xs text-rose-700">
                  Reason: {item.rejectionReason}
                </p>
              )}
              {approved && item.finalPath && (
                <p className="mt-1 text-[11px] text-slate-500 truncate" title={item.finalPath}>
                  Filed to: {item.finalPath}
                </p>
              )}
              {item.decidedAt && (
                <p className="mt-1 text-[10px] text-slate-400">
                  {new Date(item.decidedAt).toLocaleString()}
                </p>
              )}
            </div>

            {/* Dismiss */}
            <button
              onClick={() => onDismiss(item.id)}
              className={`rounded-lg p-1 transition ${
                approved
                  ? "text-emerald-400 hover:bg-emerald-100 hover:text-emerald-700"
                  : "text-rose-400 hover:bg-rose-100 hover:text-rose-700"
              }`}
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
