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

export async function listVessels(): Promise<Vessel[]> {
  return (await api.get("/vessels")).data;
}

export async function createVessel(payload: VesselInput): Promise<unknown> {
  return (await api.post("/vessels", payload)).data;
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

export async function search(q: string): Promise<SearchResult[]> {
  return (await api.get("/search", { params: { q } })).data;
}

export async function deleteFile(fileId: string): Promise<void> {
  await api.delete(`/files/${fileId}`);
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
  postal_code: string | null;
  country: string | null;
  company_name: string | null;
  employee_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  tenant_id: string | null;
  two_factor_enabled: boolean;
  password_changed_at: string | null;
  last_login: string | null;
  created_at: string;
  emergency_contact: EmergencyContact | null;
  folder_permissions: FolderPermission[];
  recent_activity: ActivityEntry[];
}

export interface ProfileUpdatePayload {
  employee_id?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  office_name?: string;
  address_line1?: string;
  address_line2?: string;
  area_locality?: string;
  landmark?: string;
  city?: string;
  state?: string;
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
}

export async function getProfile(email: string): Promise<UserProfile> {
  return (await api.get("/profile", { params: { email } })).data;
}

export async function updateProfile(email: string, data: ProfileUpdatePayload): Promise<UserProfile> {
  return (await api.patch("/profile", data, { params: { email } })).data;
}
