import {
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileType2,
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";

export interface FileMeta {
  Icon: LucideIcon;
  cls: string; // icon color
  chip: string; // badge bg+text
  label: string;
  previewable: boolean;
}

const IMG = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "tif", "tiff"];
const XLS = ["xls", "xlsx", "csv"];
const DOC = ["doc", "docx"];
const ZIP = ["zip", "rar", "7z"];

export function fileMeta(ext?: string): FileMeta {
  const e = (ext ?? "").toLowerCase();
  if (e === "pdf")
    return { Icon: FileText, cls: "text-rose-500", chip: "bg-rose-50 text-rose-600", label: "PDF", previewable: true };
  if (IMG.includes(e))
    return { Icon: FileImage, cls: "text-violet-500", chip: "bg-violet-50 text-violet-600", label: e.toUpperCase(), previewable: true };
  if (XLS.includes(e))
    return { Icon: FileSpreadsheet, cls: "text-emerald-600", chip: "bg-emerald-50 text-emerald-700", label: e.toUpperCase(), previewable: false };
  if (DOC.includes(e))
    return { Icon: FileType2, cls: "text-blue-600", chip: "bg-blue-50 text-blue-700", label: e.toUpperCase(), previewable: false };
  if (ZIP.includes(e))
    return { Icon: FileArchive, cls: "text-amber-600", chip: "bg-amber-50 text-amber-700", label: e.toUpperCase(), previewable: false };
  return { Icon: FileIcon, cls: "text-slate-400", chip: "bg-slate-100 text-slate-500", label: e ? e.toUpperCase() : "FILE", previewable: false };
}

export function formatSize(bytes?: number | null): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
