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
  status: "processing" | "done" | "failed";
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
  file: File,
  userEmail?: string
): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  if (userEmail) form.append("user_email", userEmail);
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
  category?: string,
  userEmail?: string
): Promise<Job> {
  const form = new FormData();
  form.append("file", file);
  if (category) form.append("category", category);
  if (userEmail) form.append("user_email", userEmail);
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

export async function search(q: string): Promise<SearchResult[]> {
  return (await api.get("/search", { params: { q } })).data;
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

export interface EmergencyContact {
  name: string | null;
  relationship_type: string | null;
  phone: string | null;
  email: string | null;
}

export interface FolderPermission {
  folder_name: string;
  permission_level: string;
}

export interface ActivityEntry {
  action: string;
  detail: string | null;
  created_at: string;
}

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
  address_line1: string | null;
  address_line2: string | null;
  area_locality: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  company_name: string | null;
  employee_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  office_address_line1: string | null;
  office_address_line2: string | null;
  office_area_locality: string | null;
  office_landmark: string | null;
  office_city: string | null;
  office_state: string | null;
  office_province: string | null;
  office_postal_code: string | null;
  office_country: string | null;
  office_tel: string | null;
  office_fax: string | null;
  office_phone: string | null;
  tenant_id: string | null;
  two_factor_enabled: boolean;
  password_changed_at: string | null;
  last_login: string | null;
  created_at: string;
  emergency_contact: EmergencyContact | null;
  folder_permissions: FolderPermission[];
  recent_activity: ActivityEntry[];
  photo_base64: string | null;
  date_of_joining: string | null;
}

export interface ProfileUpdatePayload {
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  office_name?: string;
  office_location?: string;
  office_address_line1?: string;
  office_address_line2?: string;
  office_area_locality?: string;
  office_landmark?: string;
  office_city?: string;
  office_state?: string;
  office_province?: string;
  office_postal_code?: string;
  office_country?: string;
  office_tel?: string;
  office_fax?: string;
  office_phone?: string;
  address_line1?: string;
  address_line2?: string;
  area_locality?: string;
  landmark?: string;
  city?: string;
  state?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  department?: string;
  manager_name?: string;
  manager_email?: string;
  two_factor_enabled?: boolean;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  emergency_contact_email?: string;
  photo_base64?: string | null;
  date_of_joining?: string | null;
}

export async function getProfile(email: string): Promise<UserProfile> {
  return (await api.get("/profile", { params: { email } })).data;
}

export async function updateProfile(email: string, data: ProfileUpdatePayload): Promise<UserProfile> {
  return (await api.patch("/profile", data, { params: { email } })).data;
}
