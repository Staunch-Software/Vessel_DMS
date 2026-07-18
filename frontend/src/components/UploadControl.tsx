import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Upload } from "lucide-react";
import type { FolderNode } from "../api";

interface Props {
  node: FolderNode;
  onUpload: (node: FolderNode, file: File, category?: string) => void;
  variant?: "inline" | "primary";
}

export function UploadControl({ node, onUpload, variant = "inline" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

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
    "dms-touch-btn inline-flex items-center gap-1.5 font-medium transition " +
    (primary
      ? `rounded-lg px-3 py-2 text-sm shadow-sm ${isMonth ? "text-accent-fg" : "text-primary-fg"} `
      : "rounded-md px-2.5 py-1 text-xs ");
  const color = isMonth
    ? primary
      ? "bg-accent hover:bg-accent-hover"
      : "bg-accent/10 text-accent ring-1 ring-accent/30 hover:bg-accent/15"
    : primary
      ? "bg-primary hover:bg-primary-hover"
      : "bg-primary/10 text-primary ring-1 ring-primary/30 hover:bg-primary/15";

  // Update rect on scroll or resize
  useEffect(() => {
    if (!open) return;
    const updateRect = () => {
      if (buttonRef.current) {
        setButtonRect(buttonRef.current.getBoundingClientRect());
      }
    };
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  const handleOpenClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMonth) {
      if (buttonRef.current) {
        setButtonRect(buttonRef.current.getBoundingClientRect());
      }
      setOpen((v) => !v);
    } else {
      pick();
    }
  };

  return (
    <div className="relative inline-block text-left">
      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} />
      <button
        ref={buttonRef}
        onClick={handleOpenClick}
        className={base + color}
        title={isMonth ? "Upload — month detected automatically" : "Upload file"}
      >
        <Upload className={primary ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
        <span className="dms-action-btn-text">
          Upload{isMonth && primary ? " (auto-month)" : ""}
        </span>
      </button>

      {isMonth && open && buttonRect && createPortal(
        <>
          {/* Backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setOpen(false)}
          />
          <div
            className="dms-card fixed z-[9999] mt-2 border border-border p-4 text-left shadow-2xl rounded-2xl w-80 max-w-[calc(100vw-2rem)]"
            style={{
              top: buttonRect.bottom,
              left: Math.max(16, buttonRect.right - 320), // Aligns right edge of 320px popover to right of button
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-sm font-bold text-fg">
              Auto-filed by month
            </p>
            <p className="mb-3 text-[11px] leading-relaxed text-muted">
              The month folder is detected from the document and created if needed.
              Optionally pick a category.
            </p>
            <label className="mb-1 block text-[11px] font-bold text-muted uppercase tracking-wider">
              Category (optional)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="dms-input mb-4 w-full rounded-lg px-2.5 py-1.5 text-xs text-fg"
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
              className="dms-btn-primary w-full rounded-lg py-2 text-xs font-semibold"
            >
              Choose file & upload
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
