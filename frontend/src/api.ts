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
  status: "processing" | "done" | "failed";
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

export async function getTree(): Promise<FolderNode[]> {
  return (await api.get("/tree")).data;
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
