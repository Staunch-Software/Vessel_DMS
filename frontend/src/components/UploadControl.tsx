import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { FolderNode } from "../api";

interface Props {
  node: FolderNode;
  onUpload: (node: FolderNode, file: File, category?: string) => void;
  variant?: "inline" | "primary";
}

export function UploadControl({ node, onUpload, variant = "inline" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");

  const pick = () => inputRef.current?.click();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(node, file, category || undefined);
    e.target.value = "";
    setOpen(false);
    setCategory("");
  };

  const isMonth = node.month_driven;

  const primary = variant === "primary";
  const base =
    "inline-flex items-center gap-2 font-medium transition " +
    (primary
      ? "rounded-lg px-4 py-2 text-sm text-white shadow-sm "
      : "rounded-md px-2.5 py-1 text-xs ");
  const color = isMonth
    ? primary
      ? "bg-violet-600 hover:bg-violet-700"
      : "bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100"
    : primary
      ? "bg-brand-600 hover:bg-brand-500"
      : "bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100";

  return (
    <div className="relative">
      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (isMonth) setOpen((v) => !v);
          else pick();
        }}
        className={base + color}
        title={isMonth ? "Upload — month detected automatically" : "Upload file"}
      >
        <Upload className={primary ? "h-4 w-4" : "h-3.5 w-3.5"} />
        Upload{isMonth && primary ? " (auto-month)" : ""}
      </button>

      {isMonth && open && (
        <div
          className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1 text-xs font-semibold text-slate-700">
            Auto-filed by month
          </p>
          <p className="mb-3 text-[11px] leading-snug text-slate-500">
            The month folder is detected from the document and created if needed.
            Optionally pick a category.
          </p>
          <label className="mb-1 block text-[11px] font-medium text-slate-600">
            Category (optional)
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mb-3 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">To be Classified</option>
            {node.categories?.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={pick}
            className="w-full rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700"
          >
            Choose file & upload
          </button>
        </div>
      )}
    </div>
  );
}
