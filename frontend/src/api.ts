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

/** Call once after login to attach the user's email to every request. */
export function setApiEmail(email: string) {
  api.defaults.headers.common["X-User-Email"] = email;
}

export async function listVessels(): Promise<Vessel[]> {
  return (await api.get("/vessels")).data;
}

export async function createVessel(payload: VesselInput): Promise<unknown> {
  return (await api.post("/vessels", payload)).data;
}

export async function reprovisionVessel(vesselId: string): Promise<{ ok: boolean; vessel_id: string; name: string }> {
  return (await api.post(`/vessels/${vesselId}/reprovision`)).data;
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
): Promise<FolderNode> {
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

export async function deleteFile(fileId: string, userEmail?: string): Promise<void> {
  await api.delete(`/files/${fileId}`, userEmail ? { params: { user_email: userEmail } } : undefined);
}

export async function deleteFolder(folderId: string, userEmail?: string, folderName?: string): Promise<void> {
  const params: Record<string, string> = {};
  if (userEmail) params.user_email = userEmail;
  if (folderName) params.folder_name = folderName;
  await api.delete(`/folders/${folderId}`, Object.keys(params).length ? { params } : undefined);
}

export async function getArchivedIds(): Promise<string[]> {
  return (await api.get("/archive/ids")).data;
}

export async function getArchivedNodes(): Promise<FolderNode[]> {
  return (await api.get("/archive/nodes")).data;
}

export async function archiveItem(itemId: string, type: "folder" | "file", userEmail?: string): Promise<void> {
  const params: Record<string, string> = { type };
  if (userEmail) params.user_email = userEmail;
  await api.post(`/archive/${itemId}`, null, { params });
}

export async function restoreItem(itemId: string, userEmail?: string): Promise<void> {
  const params: Record<string, string> = {};
  if (userEmail) params.user_email = userEmail;
  await api.post(`/restore/${itemId}`, null, { params });
}

export async function getDeletedNodes(): Promise<FolderNode[]> {
  return (await api.get("/recycle-bin/nodes")).data;
}

export async function restoreDeletedItem(itemId: string, type: "folder" | "file", userEmail?: string): Promise<void> {
  const params: Record<string, string> = { type };
  if (userEmail) params.user_email = userEmail;
  await api.post(`/recycle-bin/restore/${itemId}`, null, { params });
}

export async function permanentDeleteItem(itemId: string, type: "folder" | "file", userEmail?: string): Promise<void> {
  const params: Record<string, string> = { type };
  if (userEmail) params.user_email = userEmail;
  await api.delete(`/recycle-bin/${itemId}`, { params });
}


export async function logActivity(email: string, action: string, detail?: string): Promise<void> {
  try {
    await api.post("/activity", { email, action, detail });
  } catch {
    // non-critical — never let logging break the UI
  }
}

export function fileContentUrl(fileId: string): string {
  return `/api/files/${fileId}/content`;
}
