import axios from "axios";

export type NodeKind =
  | "main"
  | "ship"
  | "folder"
  | "leaf"
  | "month_driven"
  | "month"
  | "file";

export interface FolderNode {
  id: string;
  name: string;
  kind: NodeKind;
  upload: boolean;
  month_driven: boolean;
  has_children: boolean;
  ext?: string;
  size?: number | null;
  modified?: string | null;
  deleted_at?: string | null;
  item_type?: string | null;
  categories?: string[];
  children?: FolderNode[];
  main_folder?: string;
  original_path?: string;
}

export interface Vessel {
  id: string;
  name: string;
  imo?: string | null;
  shipyard?: string | null;
  hull_number?: string | null;
  vessel_type?: string | null;
}

export interface VesselInput {
  name: string;
  imo?: string;
  shipyard?: string;
  hull_number?: string;
  vessel_type?: string;
}

export const VESSEL_TYPES = [
  "Bulk Carrier",
  "Container Carrier",
  "Gas Carrier",
  "Oil Tanker",
  "Chemical Tanker",
  "Reffer Carrier",
  "Other Cargo Ships",
] as const;

export interface Job {
  id: string;
  filename: string;
  status: "processing" | "done" | "failed" | "pending";
  destination: string;
  detected_month: string | null;
}

const api = axios.create({ baseURL: "/api" });

// ── Restore session from sessionStorage on module load ───────────────────────
// MSAL's redirect flow causes a full page reload, so the in-memory axios
// header is cleared. Restoring it here (before any component renders) ensures
// every API call — including those triggered immediately by useEffect — carries
// the correct X-Session-ID header without a race condition.
(function restoreSessionHeader() {
  try {
    const storedSessionId =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("session_id")
        : null;
    if (storedSessionId) {
      api.defaults.headers.common["X-Session-ID"] = storedSessionId;
    }
  } catch {
    // sessionStorage may be blocked in some privacy-hardened browsers — safe to ignore.
  }
})();

/** Call once after login to attach the user's email to every request. */
export function setApiEmail(email: string) {
  api.defaults.headers.common["X-User-Email"] = email;
}

/** Call after login to attach the server-side session ID to every request. */
export function setSessionId(sessionId: string) {
  api.defaults.headers.common["X-Session-ID"] = sessionId;
}

/** Call on logout / session expiry to stop sending the session ID. */
export function clearSessionId() {
  delete api.defaults.headers.common["X-Session-ID"];
}

// ── 401 interceptor: dispatch session:unauthorized with reason ────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const detail = error.response.data?.detail;
      const reason = typeof detail === "object" ? detail?.reason : undefined;
      window.dispatchEvent(
        new CustomEvent("session:unauthorized", { detail: { reason } })
      );
    }
    return Promise.reject(error);
  }
);

export async function listVessels(): Promise<Vessel[]> {
  return (await api.get("/vessels")).data;
}

/** Result of a mutating action that may be gated behind admin approval.
 * "completed" (SPE Admin, or the action ran immediately) carries the
 * action's normal result fields flattened alongside `status`/`message`.
 * "pending" means a pending approval was created instead — nothing has
 * happened to the underlying data yet. */
export type ActionResult<T = Record<string, never>> =
  | (T & { status: "completed"; message?: string })
  | { status: "pending"; message?: string; approval_id?: string; action_type?: string };

export async function createVessel(
  payload: VesselInput
): Promise<ActionResult<Vessel>> {
  return (await api.post("/vessels", payload)).data;
}

export async function reprovisionVessel(vesselId: string): Promise<{ ok: boolean; vessel_id: string; name: string }> {
  return (await api.post(`/vessels/${vesselId}/reprovision`)).data;
}

export async function updateVessel(
  vesselId: string,
  payload: Partial<VesselInput>
): Promise<ActionResult<Vessel>> {
  return (await api.patch(`/vessels/${vesselId}`, payload)).data;
}

export interface Stats {
  vessels: number;
  main_folders: number;
  month_driven: number;
  months: number;
  documents: number | null;
}

export async function getMains(): Promise<FolderNode[]> {
  return (await api.get("/mains")).data;
}

export async function getFolder(id: string): Promise<FolderNode> {
  return (await api.get(`/folders/${id}`)).data;
}

export async function getChildren(id: string): Promise<FolderNode[]> {
  return (await api.get(`/folders/${id}/children`)).data;
}

export async function getStats(): Promise<Stats> {
  return (await api.get("/stats")).data;
}

export async function uploadFile(
  folderId: string,
  file: File
): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  return (await api.post(`/folders/${folderId}/upload`, form)).data;
}

export async function createSubfolder(
  folderId: string,
  name: string,
  userEmail?: string
): Promise<ActionResult<FolderNode>> {
  return (await api.post(`/folders/${folderId}/subfolder`, { name, user_email: userEmail || undefined })).data;
}

export async function monthUpload(
  folderId: string,
  file: File,
  category?: string
): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  if (category) form.append("category", category);
  return (await api.post(`/folders/${folderId}/month-upload`, form)).data;
}

export async function getJob(jobId: string): Promise<Job> {
  return (await api.get(`/jobs/${jobId}`)).data;
}

export interface SearchResult {
  id: string;
  name: string;
  kind: NodeKind;
  trail: { id: string; name: string }[];
  path: string;
}

export async function search(
  q: string,
  vesselId?: string | null
): Promise<SearchResult[]> {
  return (
    await api.get("/search", { params: { q, vessel_id: vesselId || undefined } })
  ).data;
}

export async function deleteFile(fileId: string, userEmail?: string, reason?: string): Promise<ActionResult> {
  const params: Record<string, string> = {};
  if (userEmail) params.user_email = userEmail;
  if (reason) params.reason = reason;
  return (
    await api.delete(`/files/${fileId}`, Object.keys(params).length ? { params } : undefined)
  ).data;
}

export async function deleteFolder(folderId: string, userEmail?: string, folderName?: string): Promise<ActionResult> {
  const params: Record<string, string> = {};
  if (userEmail) params.user_email = userEmail;
  if (folderName) params.folder_name = folderName;
  return (
    await api.delete(`/folders/${folderId}`, Object.keys(params).length ? { params } : undefined)
  ).data;
}

export async function getArchivedIds(): Promise<string[]> {
  return (await api.get("/archive/ids")).data;
}

export async function getArchivedNodes(): Promise<FolderNode[]> {
  return (await api.get("/archive/nodes")).data;
}

export interface AuditContext {
  itemName?: string;
  department?: string;
  vesselName?: string;
  reason?: string;
}

export async function archiveItem(
  itemId: string, type: "folder" | "file", userEmail?: string, audit?: AuditContext
): Promise<ActionResult> {
  const params: Record<string, string> = { type };
  if (userEmail) params.user_email = userEmail;
  if (audit?.itemName) params.item_name = audit.itemName;
  if (audit?.department) params.department = audit.department;
  if (audit?.vesselName) params.vessel_name = audit.vesselName;
  if (audit?.reason) params.reason = audit.reason;
  return (await api.post(`/archive/${itemId}`, null, { params })).data;
}

export async function restoreItem(
  itemId: string, userEmail?: string, type: "folder" | "file" = "folder", audit?: AuditContext
): Promise<ActionResult> {
  const params: Record<string, string> = { type };
  if (userEmail) params.user_email = userEmail;
  if (audit?.itemName) params.item_name = audit.itemName;
  if (audit?.department) params.department = audit.department;
  if (audit?.vesselName) params.vessel_name = audit.vesselName;
  return (await api.post(`/restore/${itemId}`, null, { params })).data;
}

export async function getDeletedNodes(): Promise<FolderNode[]> {
  return (await api.get("/recycle-bin/nodes")).data;
}

export async function restoreDeletedItem(
  itemId: string, type: "folder" | "file", userEmail?: string, audit?: AuditContext
): Promise<ActionResult> {
  const params: Record<string, string> = { type };
  if (userEmail) params.user_email = userEmail;
  if (audit?.itemName) params.item_name = audit.itemName;
  if (audit?.department) params.department = audit.department;
  if (audit?.vesselName) params.vessel_name = audit.vesselName;
  return (await api.post(`/recycle-bin/restore/${itemId}`, null, { params })).data;
}

export async function permanentDeleteItem(
  itemId: string, type: "folder" | "file", userEmail?: string, audit?: AuditContext
): Promise<ActionResult> {
  const params: Record<string, string> = { type };
  if (userEmail) params.user_email = userEmail;
  if (audit?.itemName) params.item_name = audit.itemName;
  if (audit?.department) params.department = audit.department;
  if (audit?.vesselName) params.vessel_name = audit.vesselName;
  return (await api.delete(`/recycle-bin/${itemId}`, { params })).data;
}


export async function logActivity(email: string, action: string, detail?: string): Promise<void> {
  try {
    await api.post("/activity", { email, action, detail });
  } catch {
    // non-critical — never let logging break the UI
  }
}

export function fileContentUrl(fileId: string): string {
  const sessionId = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("session_id") : null;
  if (sessionId) {
    return `/api/files/${fileId}/content?session_id=${encodeURIComponent(sessionId)}`;
  }
  return `/api/files/${fileId}/content`;
}

// ────────────────────────── Approvals ──────────────────────────

export type ApprovalStatus = "pending" | "approved" | "rejected" | "completed";
export type ApprovalEntryKind = "approval" | "activity";
export type ApprovalActionType =
  | "upload"
  | "delete_document"
  | "delete_folder"
  | "create_folder"
  | "create_vessel"
  | "update_vessel"
  | "archive_item"
  | "restore_item"
  | "restore_from_recycle_bin"
  | "permanent_delete";

export interface ApprovalChange {
  field: string;
  old: string | null;
  new: string | null;
}

export interface ApprovalRequest {
  id: string;
  // Upload-specific — null for non-upload action types.
  filename: string | null;
  content_type: string | null;
  size: number | null;
  destination_folder_id: string | null;
  destination_path: string | null;
  is_month_upload: boolean;
  category: string | null;
  detected_month: string | null;
  drive_item_id: string | null;
  // Common to every entry.
  uploaded_by_email: string;
  uploaded_by_name: string;
  uploaded_at: string;
  status: ApprovalStatus;
  decided_by_email: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
  final_path: string | null;
  created_at: string;
  // Generic fields covering every action type.
  entry_kind: ApprovalEntryKind;
  action_type: ApprovalActionType;
  department: string | null;
  vessel_id: string | null;
  vessel_name: string | null;
  target_id: string | null;
  target_description: string | null;
  changes: ApprovalChange[];
  message: string | null;
  payload: { reason?: string; item_type?: string; [key: string]: unknown };
}

export async function listApprovals(
  adminEmail: string,
  status?: ApprovalStatus | "all",
  q?: string
): Promise<ApprovalRequest[]> {
  const params: Record<string, string> = { admin: adminEmail };
  if (status && status !== "all") params.status = status;
  if (q) params.q = q;
  return (await api.get("/approvals", { params })).data;
}

export async function listMyApprovals(
  status?: ApprovalStatus | "all"
): Promise<ApprovalRequest[]> {
  const params: Record<string, string> = {};
  if (status && status !== "all") params.status = status;
  return (await api.get("/my-approvals", { params })).data;
}


export async function approveRequest(adminEmail: string, requestId: string): Promise<void> {
  await api.post(`/approvals/${requestId}/approve`, null, { params: { admin: adminEmail } });
}

export async function rejectRequest(
  adminEmail: string,
  requestId: string,
  reason: string
): Promise<void> {
  await api.post(`/approvals/${requestId}/reject`, { reason }, { params: { admin: adminEmail } });
}

export function approvalPreviewUrl(requestId: string, adminEmail: string): string {
  return `/api/approvals/${requestId}/preview?admin=${encodeURIComponent(adminEmail)}`;
}

// ────────────────────────── Profile ──────────────────────────

export async function getProfile(email: string): Promise<UserProfile> {
  return (await api.get(`/profile`, { params: { email } })).data;
}


// ────────────────────────── Full Profile Types ──────────────────────────

export interface UserProfile {
  email: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  azure_oid: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  office_location: string | null;
  office_name: string | null;
  company_name: string | null;
  employee_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  tenant_id: string | null;
  two_factor_enabled: boolean;
  password_changed_at: string | null;
  last_login: string | null;
  created_at: string;
  photo_base64: string | null;
  date_of_joining: string | null;
  emergency_contact: null;
  folder_permissions: { folder_name: string; permission_level: string }[];
  recent_activity: { action: string; detail: string | null; created_at: string }[];
}

export interface ProfileUpdatePayload {
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  office_location?: string;
  office_name?: string;
  department?: string;
  manager_name?: string;
  manager_email?: string;
  two_factor_enabled?: boolean;
  photo_base64?: string;
  date_of_joining?: string;
}

export async function updateProfile(
  email: string,
  payload: ProfileUpdatePayload
): Promise<UserProfile> {
  return (await api.patch(`/profile`, payload, { params: { email } })).data;
}


// ────────────────────────── Sessions ──────────────────────────

export interface SessionInfo {
  session_id: string;
  status: "Active" | "Expired" | "Logged Out" | "Revoked";
  login_time: string | null;
  last_activity: string | null;
  expiry_time: string | null;
  logout_time: string | null;
  browser: string | null;
  operating_system: string | null;
  device_type: string | null;
  ip_address: string | null;
  authentication_method: string;
  is_current: boolean;
}

export interface SessionAuditEntry {
  session_id: string | null;
  event: string;
  detail: string | null;
  ip_address: string | null;
  browser: string | null;
  status: string | null;
  login_time: string | null;
  logout_time: string | null;
  active_duration: number | null;
  active_duration_formatted: string | null;
  created_at: string | null;
}

export async function listSessions(): Promise<SessionInfo[]> {
  return (await api.get("/sessions")).data;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await api.delete(`/sessions/${sessionId}`);
}

export async function listSessionAudit(limit = 50): Promise<SessionAuditEntry[]> {
  return (await api.get("/sessions/audit", { params: { limit } })).data;
}
