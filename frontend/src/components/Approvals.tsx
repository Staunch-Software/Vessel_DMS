import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Check,
  Clock3,
  Download,
  ExternalLink,
  FolderPlus,
  FolderX,
  Search,
  Ship,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Trash2,
  User,
  X,
} from "lucide-react";
import {
  approveRequest,
  approvalPreviewUrl,
  listApprovals,
  listMyApprovals,
  rejectRequest,
  type ApprovalActionType,
  type ApprovalRequest,
  type ApprovalStatus,
} from "../api";
import { fileMeta, formatSize, type FileMeta } from "./fileType";

type Tab = ApprovalStatus | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Admin Activity" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const ACTION_LABELS: Record<ApprovalActionType, string> = {
  upload: "Upload",
  delete_document: "Delete Document",
  delete_folder: "Delete Folder",
  create_folder: "Create Folder",
  create_vessel: "Create Vessel",
  update_vessel: "Update Vessel",
  archive_item: "Archive",
  restore_item: "Restore",
  restore_from_recycle_bin: "Restore from Recycle Bin",
  permanent_delete: "Permanently Delete",
};

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
  if (status === "approved" || status === "completed")
    return "bg-success-bg text-success ring-1 ring-success/20";
  return "bg-error-bg text-error ring-1 ring-error/20";
}

function statusLabel(status: ApprovalStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Icon/chip for a row — reuses the file-type icon set for document actions
 * (upload/delete_document), falls back to a generic action icon for
 * folder/vessel actions that have no single file to represent them. */
function rowMeta(r: ApprovalRequest): FileMeta {
  if (r.action_type === "upload" || r.action_type === "delete_document") {
    const name = r.filename || r.target_description || "";
    return fileMeta(name.includes(".") ? name.split(".").pop() : undefined);
  }
  if (r.action_type === "create_folder")
    return { Icon: FolderPlus, cls: "text-accent", chip: "bg-accent/10 text-accent", label: "Folder", previewable: false };
  if (r.action_type === "delete_folder")
    return { Icon: FolderX, cls: "text-error", chip: "bg-error-bg text-error", label: "Folder", previewable: false };
  if (r.action_type === "archive_item")
    return { Icon: Archive, cls: "text-muted", chip: "bg-surface2 text-muted", label: "Item", previewable: false };
  if (r.action_type === "restore_item" || r.action_type === "restore_from_recycle_bin")
    return { Icon: ArchiveRestore, cls: "text-accent", chip: "bg-accent/10 text-accent", label: "Item", previewable: false };
  if (r.action_type === "permanent_delete")
    return { Icon: Trash2, cls: "text-error", chip: "bg-error-bg text-error", label: "Item", previewable: false };
  return { Icon: Ship, cls: "text-primary", chip: "bg-primary/10 text-primary", label: "Vessel", previewable: false };
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
            (a.filename || a.target_description || "").toLowerCase().includes(q)
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
    const c = { pending: 0, approved: 0, completed: 0, rejected: 0 };
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
    const reason = rejectReason.trim();
    if (!reason) return;
    setBusyId(r.id);
    try {
      await rejectRequest(actingEmail, r.id, reason);
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
          Review pending requests from your team and audit SPE Admin activity.
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
                placeholder="Search filename, vessel, requester…"
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
                const meta = rowMeta(r);
                const title = r.filename || r.target_description || ACTION_LABELS[r.action_type];
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
                          {title}
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
                          {r.department && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {r.department}
                            </span>
                          )}
                          {r.vessel_name && (
                            <span className="inline-flex items-center gap-1">
                              <Ship className="h-3 w-3" />
                              {r.vessel_name}
                            </span>
                          )}
                        </span>
                        {r.message && (
                          <span className="mt-0.5 block truncate text-xs text-subtle">{r.message}</span>
                        )}
                      </span>
                    </button>

                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {r.entry_kind === "activity" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-accent/20">
                          <ShieldAlert className="h-3 w-3" />
                          Admin Activity
                        </span>
                      )}
                      <span
                        className={"rounded-full px-2.5 py-1 text-xs font-medium " + statusBadge(r.status)}
                      >
                        {statusLabel(r.status)}
                      </span>
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
            <h3 className="mb-1 text-sm font-semibold text-fg">Reason for Rejection</h3>
            <p className="mb-3 text-xs text-muted">
              {rejectingId && requests.find((x) => x.id === rejectingId)?.action_type === "upload"
                ? "The document will be moved to the folder's \"To be Classified\" area. "
                : "Nothing will be changed — the request is simply declined. "}
              A reason is required so the requester understands why.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Explain why this request is being rejected…"
              autoFocus
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
                  if (r && rejectReason.trim()) confirmReject(r);
                }}
                disabled={busyId === rejectingId || !rejectReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-error-bg px-4 py-2 text-sm font-medium text-error ring-1 ring-error/20 transition hover:bg-error/15 disabled:opacity-50"
              >
                <ShieldX className="h-4 w-4" />
                Reject
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
  const meta = rowMeta(request);
  const isFileAction = request.action_type === "upload" || request.action_type === "delete_document";
  const filename = request.filename || request.target_description || "";
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
            <p className="truncate text-sm font-semibold text-fg">
              {filename || ACTION_LABELS[request.action_type]}
            </p>
            <p className="text-xs text-muted">
              {isFileAction
                ? [meta.label, formatSize(request.size ?? undefined)].filter(Boolean).join(" · ")
                : ACTION_LABELS[request.action_type]}
            </p>
          </div>
          {isFileAction && request.action_type === "upload" && (
            <>
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
                download={filename}
                className="rounded-md p-2 text-muted transition hover:bg-surface-hover"
                title="Download"
              >
                <Download className="h-4 w-4" />
              </a>
            </>
          )}
          <button onClick={onClose} className="rounded-md p-2 text-muted transition hover:bg-surface-hover">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-border px-5 py-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <dt className="text-xs text-subtle">{request.entry_kind === "activity" ? "Performed by" : "Requested by"}</dt>
              <dd className="text-fg">{request.uploaded_by_name || request.uploaded_by_email}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Timestamp</dt>
              <dd className="text-fg">{formatDateTime(request.uploaded_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Action type</dt>
              <dd className="text-fg">{ACTION_LABELS[request.action_type]}</dd>
            </div>
            {request.department && (
              <div>
                <dt className="text-xs text-subtle">Department</dt>
                <dd className="text-fg">{request.department}</dd>
              </div>
            )}
            {request.vessel_name && (
              <div>
                <dt className="text-xs text-subtle">Vessel</dt>
                <dd className="text-fg">{request.vessel_name}</dd>
              </div>
            )}
            {request.destination_path && (
              <div className="col-span-2">
                <dt className="text-xs text-subtle">Destination folder</dt>
                <dd className="truncate text-fg">{request.destination_path}</dd>
              </div>
            )}
            {request.detected_month && (
              <div>
                <dt className="text-xs text-subtle">Detected month</dt>
                <dd className="text-accent">{request.detected_month}</dd>
              </div>
            )}
            {request.message && (
              <div className="col-span-2">
                <dt className="text-xs text-subtle">Details</dt>
                <dd className="text-fg">{request.message}</dd>
              </div>
            )}
            {request.payload?.reason && (
              <div className="col-span-2 rounded-lg border border-warning/20 bg-warning-bg px-3 py-2">
                <dt className="text-xs font-semibold text-warning">
                  {request.action_type === "archive_item" ? "Reason for Archiving" : "Reason for Deletion"}
                </dt>
                <dd className="mt-0.5 text-fg">"{request.payload.reason}"</dd>
              </div>
            )}
            {request.status !== "pending" && (
              <>
                <div>
                  <dt className="text-xs text-subtle">
                    {request.entry_kind === "activity"
                      ? "Status"
                      : request.status === "approved"
                        ? "Approved by"
                        : request.status === "rejected"
                          ? "Rejected by"
                          : "Decided by"}
                  </dt>
                  <dd className="text-fg">
                    {request.entry_kind === "activity"
                      ? "Completed — No Approval Required"
                      : request.decided_by_email}
                  </dd>
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

          {request.changes.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-subtle">Changes</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-border">
                    {request.changes.map((c, i) => (
                      <tr key={i}>
                        <td className="w-1/3 bg-surface2 px-3 py-2 font-medium text-fg">{c.field}</td>
                        <td className="px-3 py-2 text-muted">{c.old ?? "—"}</td>
                        <td className="w-6 px-1 py-2 text-center text-subtle">→</td>
                        <td className="px-3 py-2 font-medium text-fg">{c.new ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-surface2">
          {isFileAction && request.action_type === "upload" ? (
            meta.previewable ? (
              filename.toLowerCase().endsWith(".pdf") ? (
                <iframe title={filename} src={url} className="h-full w-full border-0" />
              ) : (
                <div className="flex h-full items-center justify-center p-6">
                  <img src={url} alt={filename} className="max-h-full max-w-full rounded shadow" />
                </div>
              )
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <meta.Icon className={"h-14 w-14 " + meta.cls} />
                <p className="text-sm text-muted">Preview isn't available for {meta.label} files.</p>
                <a
                  href={url}
                  download={filename}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition hover:bg-primary-hover"
                >
                  <Download className="h-4 w-4" />
                  Download to view
                </a>
              </div>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              {request.action_type === "delete_document" || request.action_type === "delete_folder" ? (
                <Trash2 className={"h-14 w-14 " + meta.cls} />
              ) : (
                <meta.Icon className={"h-14 w-14 " + meta.cls} />
              )}
              <p className="max-w-sm text-sm text-muted">
                {request.message || "No preview available for this action."}
              </p>
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
