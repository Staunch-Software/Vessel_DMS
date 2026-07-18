import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Download,
  ExternalLink,
  Search,
  ShieldCheck,
  ShieldX,
  User,
  X,
} from "lucide-react";
import {
  approveRequest,
  approvalPreviewUrl,
  listApprovals,
  listMyApprovals,
  rejectRequest,
  type ApprovalRequest,
  type ApprovalStatus,
} from "../api";
import { fileMeta, formatSize } from "./fileType";

type Tab = ApprovalStatus | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: ApprovalStatus): string {
  if (status === "pending") return "bg-warning-bg text-warning ring-1 ring-warning/20";
  if (status === "approved") return "bg-success-bg text-success ring-1 ring-success/20";
  return "bg-error-bg text-error ring-1 ring-error/20";
}

export function Approvals({
  actingEmail,
  isAdmin = false,
  initialSelectedId = null,
  initialTab,
  onClearInitial,
}: {
  actingEmail: string;
  isAdmin?: boolean;
  initialSelectedId?: string | null;
  initialTab?: Tab;
  onClearInitial?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab || "pending");
  const [query, setQuery] = useState("");
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAdmin) {
        setRequests(await listApprovals(actingEmail, tab, query || undefined));
      } else {
        let res = await listMyApprovals(tab);
        if (query) {
          const q = query.toLowerCase();
          res = res.filter((a) =>
            a.filename.toLowerCase().includes(q)
          );
        }
        setRequests(res);
      }
    } catch (e) {
      setError("Could not load approval requests.");
    } finally {
      setLoading(false);
    }
  }, [actingEmail, tab, query, isAdmin]);

  useEffect(() => {
    if (initialTab) {
      setTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (initialSelectedId && requests.length > 0) {
      const found = requests.find((r) => r.id === initialSelectedId);
      if (found) {
        setSelected(found);
        onClearInitial?.();
      }
    }
  }, [initialSelectedId, requests, onClearInitial]);

  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0 };
    for (const r of requests) if (r.status in c) c[r.status as keyof typeof c]++;
    return c;
  }, [requests]);

  const handleApprove = async (r: ApprovalRequest) => {
    setBusyId(r.id);
    try {
      await approveRequest(actingEmail, r.id);
      await load();
      if (selected?.id === r.id) setSelected(null);
    } catch (e) {
      setError(errDetail(e, "Approve failed."));
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async (r: ApprovalRequest) => {
    setBusyId(r.id);
    try {
      await rejectRequest(actingEmail, r.id, rejectReason.trim() || undefined);
      setRejectingId(null);
      setRejectReason("");
      await load();
      if (selected?.id === r.id) setSelected(null);
    } catch (e) {
      setError(errDetail(e, "Reject failed."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b border-border bg-surface dms-page-px py-5">
        <h2 className="text-xl font-semibold text-fg">Approvals</h2>
        <p className="mt-0.5 text-sm text-muted">
          Review documents uploaded by your team before they're filed.
        </p>
      </header>

      <div className="dms-page-bg flex-1 overflow-y-auto dms-page-px dms-page-py">
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Tabs + search — wrap on mobile */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap overflow-hidden rounded-lg border border-border bg-surface">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={
                    "px-3 py-2 text-sm font-medium transition " +
                    (tab === t.key
                      ? "bg-primary text-primary-fg"
                      : "text-muted hover:bg-surface-hover")
                  }
                >
                  {t.label}
                  {t.key === "pending" && counts.pending > 0 && (
                    <span className="ml-1.5 text-xs opacity-80">({counts.pending})</span>
                  )}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:ml-auto sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search filename, uploader…"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-error/30 bg-error-bg px-4 py-2 text-sm text-error">
              {error}
            </p>
          )}

          {/* List */}
          {loading ? (
            <p className="py-10 text-center text-sm text-muted">Loading…</p>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-10 text-center">
              <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-subtle" />
              <p className="text-sm text-muted">
                {tab === "pending" ? "Nothing waiting for review." : "No requests here."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {requests.map((r) => {
                const meta = fileMeta(r.filename.split(".").pop());
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <button
                      onClick={() => setSelected(r)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-lg " + meta.chip}>
                        <meta.Icon className={"h-5 w-5 " + meta.cls} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-fg">
                          {r.filename}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                          <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {r.uploaded_by_name || r.uploaded_by_email}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            {formatDateTime(r.uploaded_at)}
                          </span>
                          <span className="truncate">→ {r.destination_path}</span>
                        </span>
                      </span>
                    </button>

                    <span
                      className={"shrink-0 rounded-full px-2.5 py-1 text-xs font-medium " + statusBadge(r.status)}
                    >
                      {r.status}
                    </span>

                    {isAdmin && r.status === "pending" && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => handleApprove(r)}
                          disabled={busyId === r.id}
                          className="dms-touch-btn inline-flex items-center gap-1 rounded-md bg-success px-2 py-1.5 text-xs font-medium text-success-fg transition hover:brightness-110 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5 shrink-0" />
                          <span className="dms-action-btn-text">Approve</span>
                        </button>
                        <button
                          onClick={() => setRejectingId(r.id)}
                          disabled={busyId === r.id}
                          className="dms-touch-btn inline-flex items-center gap-1 rounded-md bg-error-bg px-2 py-1.5 text-xs font-medium text-error ring-1 ring-error/20 transition hover:bg-error/15 disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5 shrink-0" />
                          <span className="dms-action-btn-text">Reject</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Reject reason prompt */}
      {rejectingId && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-fg/40 p-4 backdrop-blur-sm"
          onClick={() => setRejectingId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold text-fg">Reject this document?</h3>
            <p className="mb-3 text-xs text-muted">
              It will be moved to the folder's "To be Classified" area. You can add a reason
              for the uploader (optional).
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Reason (optional)"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejectingId(null)}
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const r = requests.find((x) => x.id === rejectingId);
                  if (r) confirmReject(r);
                }}
                disabled={busyId === rejectingId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-error-bg px-4 py-2 text-sm font-medium text-error ring-1 ring-error/20 transition hover:bg-error/15 disabled:opacity-50"
              >
                <ShieldX className="h-4 w-4" />
                Reject document
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / preview drawer */}
      {selected && (
        <ApprovalPreview
          request={selected}
          actingEmail={actingEmail}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onApprove={() => handleApprove(selected)}
          onReject={() => setRejectingId(selected.id)}
          busy={busyId === selected.id}
        />
      )}
    </div>
  );
}

function ApprovalPreview({
  request,
  actingEmail,
  isAdmin = false,
  onClose,
  onApprove,
  onReject,
  busy,
}: {
  request: ApprovalRequest;
  actingEmail: string;
  isAdmin?: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  const meta = fileMeta(request.filename.split(".").pop());
  const url = approvalPreviewUrl(request.id, actingEmail);

  return (
    <div className="fixed inset-0 z-40 flex sm:justify-end bg-fg/40" onClick={onClose}>
      <div
        className="flex w-full flex-col bg-surface shadow-2xl sm:h-full sm:max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
          <meta.Icon className={"h-5 w-5 shrink-0 " + meta.cls} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{request.filename}</p>
            <p className="text-xs text-muted">
              {[meta.label, formatSize(request.size)].filter(Boolean).join(" · ")}
            </p>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-2 text-muted transition hover:bg-surface-hover"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <a
            href={url}
            download={request.filename}
            className="rounded-md p-2 text-muted transition hover:bg-surface-hover"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </a>
          <button onClick={onClose} className="rounded-md p-2 text-muted transition hover:bg-surface-hover">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-border px-5 py-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs text-subtle">Uploaded by</dt>
              <dd className="text-fg">{request.uploaded_by_name || request.uploaded_by_email}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Uploaded</dt>
              <dd className="text-fg">{formatDateTime(request.uploaded_at)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-subtle">Destination folder</dt>
              <dd className="truncate text-fg">{request.destination_path}</dd>
            </div>
            {request.detected_month && (
              <div>
                <dt className="text-xs text-subtle">Detected month</dt>
                <dd className="text-accent">{request.detected_month}</dd>
              </div>
            )}
            {request.status !== "pending" && (
              <>
                <div>
                  <dt className="text-xs text-subtle">
                    {request.status === "approved" ? "Approved by" : "Rejected by"}
                  </dt>
                  <dd className="text-fg">{request.decided_by_email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-subtle">Decided</dt>
                  <dd className="text-fg">{formatDateTime(request.decided_at)}</dd>
                </div>
                {request.rejection_reason && (
                  <div className="col-span-2">
                    <dt className="text-xs text-subtle">Reason</dt>
                    <dd className="text-fg">{request.rejection_reason}</dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </div>

        <div className="flex-1 overflow-auto bg-surface2">
          {meta.previewable ? (
            request.filename.toLowerCase().endsWith(".pdf") ? (
              <iframe title={request.filename} src={url} className="h-full w-full border-0" />
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <img src={url} alt={request.filename} className="max-h-full max-w-full rounded shadow" />
              </div>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <meta.Icon className={"h-14 w-14 " + meta.cls} />
              <p className="text-sm text-muted">Preview isn't available for {meta.label} files.</p>
              <a
                href={url}
                download={request.filename}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
              >
                <Download className="h-4 w-4" />
                Download to view
              </a>
            </div>
          )}
        </div>

        {isAdmin && request.status === "pending" && (
          <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
            <button
              onClick={onReject}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-error-bg px-4 py-2 text-sm font-medium text-error ring-1 ring-error/20 transition hover:bg-error/15 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Reject
            </button>
            <button
              onClick={onApprove}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-sm font-medium text-success-fg transition hover:brightness-110 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Approve
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function errDetail(e: unknown, fallback: string): string {
  return (
    (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? fallback
  );
}
