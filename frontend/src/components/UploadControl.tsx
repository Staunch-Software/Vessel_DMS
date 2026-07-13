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
      ? `rounded-lg px-4 py-2 text-sm shadow-sm ${isMonth ? "text-accent-fg" : "text-primary-fg"} `
      : "rounded-md px-2.5 py-1 text-xs ");
  const color = isMonth
    ? primary
      ? "bg-accent hover:bg-accent-hover"
      : "bg-accent/10 text-accent ring-1 ring-accent/30 hover:bg-accent/15"
    : primary
      ? "bg-primary hover:bg-primary-hover"
      : "bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/15";

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
          className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-border bg-surface p-3 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-1 text-xs font-semibold text-fg">
            Auto-filed by month
          </p>
          <p className="mb-3 text-[11px] leading-snug text-muted">
            The month folder is detected from the document and created if needed.
            Optionally pick a category.
          </p>
          <label className="mb-1 block text-[11px] font-medium text-muted">
            Category (optional)
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mb-3 w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-xs text-fg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
            className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:bg-accent-hover"
          >
            Choose file & upload
          </button>
        </div>
      )}
    </div>
  );
}
