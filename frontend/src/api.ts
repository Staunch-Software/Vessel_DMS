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
  categories?: string[];
  children?: FolderNode[];
}

export interface Vessel {
  id: string;
  name: string;
  imo?: string | null;
}

export interface Job {
  id: string;
  filename: string;
  status: "processing" | "done" | "failed" | "pending";
  destination: string;
  detected_month: string | null;
}

const api = axios.create({ baseURL: "/api" });

export async function listVessels(): Promise<Vessel[]> {
  return (await api.get("/vessels")).data;
}

export async function createVessel(
  name: string,
  imo?: string
): Promise<unknown> {
  return (await api.post("/vessels", { name, imo })).data;
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
  file: File,
  uploaderEmail: string,
  uploaderName?: string
): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  form.append("uploader_email", uploaderEmail);
  form.append("uploader_name", uploaderName ?? "");
  return (await api.post(`/folders/${folderId}/upload`, form)).data;
}

export async function monthUpload(
  folderId: string,
  file: File,
  category: string | undefined,
  uploaderEmail: string,
  uploaderName?: string
): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  if (category) form.append("category", category);
  form.append("uploader_email", uploaderEmail);
  form.append("uploader_name", uploaderName ?? "");
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

export async function deleteFile(fileId: string): Promise<void> {
  await api.delete(`/files/${fileId}`);
}

export function fileContentUrl(fileId: string): string {
  return `/api/files/${fileId}/content`;
}

// --------------------------------------------------------------- approvals
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  uploaded_by_email: string;
  uploaded_by_name: string;
  uploaded_at: string;
  destination_folder_id: string;
  destination_path: string;
  is_month_upload: boolean;
  category: string | null;
  detected_month: string | null;
  status: ApprovalStatus;
  decided_by_email: string | null;
  decided_at: string | null;
  rejection_reason: string | null;
  final_path: string | null;
}

function adminHeaders(actingEmail: string) {
  return { headers: { "X-User-Email": actingEmail } };
}

export async function listApprovals(
  actingEmail: string,
  status?: ApprovalStatus | "all",
  q?: string
): Promise<ApprovalRequest[]> {
  return (
    await api.get("/approvals", {
      ...adminHeaders(actingEmail),
      params: { status, q },
    })
  ).data;
}

export async function getApproval(
  actingEmail: string,
  requestId: string
): Promise<ApprovalRequest> {
  return (await api.get(`/approvals/${requestId}`, adminHeaders(actingEmail))).data;
}

export function approvalPreviewUrl(requestId: string, actingEmail: string): string {
  return `/api/approvals/${requestId}/preview?admin_email=${encodeURIComponent(actingEmail)}`;
}

export async function approveRequest(
  actingEmail: string,
  requestId: string
): Promise<ApprovalRequest> {
  return (
    await api.post(`/approvals/${requestId}/approve`, {}, adminHeaders(actingEmail))
  ).data;
}

export async function rejectRequest(
  actingEmail: string,
  requestId: string,
  reason?: string
): Promise<ApprovalRequest> {
  return (
    await api.post(
      `/approvals/${requestId}/reject`,
      { reason: reason || null },
      adminHeaders(actingEmail)
    )
  ).data;
}
