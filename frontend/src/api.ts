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
