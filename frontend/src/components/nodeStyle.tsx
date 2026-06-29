import {
  Anchor,
  CalendarDays,
  FileBox,
  FileText,
  Folder,
  FolderClosed,
  Layers,
  Ship,
  Upload,
  type LucideIcon,
} from "lucide-react";
import type { FolderNode } from "../api";

export interface MainAccent {
  bar: string; // left border colour
  chip: string; // badge background
  text: string; // badge text
  icon: string; // icon colour
}

export const MAIN_ACCENTS: Record<string, MainAccent> = {
  "Technical & Crewing": {
    bar: "border-l-orange-400",
    chip: "bg-orange-100",
    text: "text-orange-700",
    icon: "text-orange-500",
  },
  "Commercial & Chartering": {
    bar: "border-l-emerald-400",
    chip: "bg-emerald-100",
    text: "text-emerald-700",
    icon: "text-emerald-500",
  },
  Insurance: {
    bar: "border-l-amber-400",
    chip: "bg-amber-100",
    text: "text-amber-700",
    icon: "text-amber-600",
  },
};

export function iconFor(node: FolderNode): { Icon: LucideIcon; cls: string } {
  switch (node.kind) {
    case "main":
      return { Icon: Layers, cls: "text-brand-600" };
    case "ship":
      return { Icon: Ship, cls: "text-brand-500" };
    case "month_driven":
      return { Icon: CalendarDays, cls: "text-violet-500" };
    case "month":
      return { Icon: CalendarDays, cls: "text-violet-400" };
    case "file":
      return { Icon: FileText, cls: "text-slate-400" };
    case "leaf":
      return { Icon: FileBox, cls: "text-slate-400" };
    case "folder":
      return node.name.toLowerCase().includes("common")
        ? { Icon: FolderClosed, cls: "text-sky-500" }
        : { Icon: Folder, cls: "text-slate-400" };
    default:
      return { Icon: Folder, cls: "text-slate-400" };
  }
}

export const UploadIcon = Upload;
export const AnchorIcon = Anchor;
