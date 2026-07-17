import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { FolderNode } from "../api";
import { iconFor } from "./nodeStyle";
import { UploadControl } from "./UploadControl";

interface Props {
  node: FolderNode;
  depth: number;
  defaultOpen?: boolean;
  onUpload: (node: FolderNode, file: File, category?: string) => void;
}

export function TreeNode({ node, depth, defaultOpen, onUpload }: Props) {
  const [open, setOpen] = useState(defaultOpen ?? depth < 1);
  const { Icon, cls } = iconFor(node);
  const hasChildren = !!node.children && node.children.length > 0;
  const isFile = node.kind === "file";

  return (
    <div>
      <div
        className={
          "group flex items-center gap-2 rounded-lg py-1.5 pr-2 transition hover:bg-bg " +
          (isFile ? "" : "cursor-pointer")
        }
        style={{ paddingLeft: depth * 18 + 4 }}
        onClick={() => hasChildren && setOpen((v) => !v)}
      >
        <span className="flex h-4 w-4 items-center justify-center text-subtle">
          {hasChildren ? (
            <ChevronRight
              className={
                "h-4 w-4 transition-transform " + (open ? "rotate-90" : "")
              }
            />
          ) : null}
        </span>

        <Icon className={"h-4 w-4 shrink-0 " + cls} />

        <span
          className={
            "flex-1 truncate text-sm " +
            (node.kind === "ship"
              ? "font-semibold text-fg"
              : node.kind === "month"
                ? "font-medium text-accent"
                : isFile
                  ? "text-muted"
                  : "text-fg")
          }
        >
          {node.name}
        </span>

        {node.month_driven && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent ring-1 ring-accent/20">
            auto-month
          </span>
        )}

        {node.upload && (
          <span className="opacity-0 transition group-hover:opacity-100">
            <UploadControl node={node} onUpload={onUpload} />
          </span>
        )}
      </div>

      {open && hasChildren && (
        <div>
          {node.children!.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              depth={depth + 1}
              onUpload={onUpload}
            />
          ))}
        </div>
      )}
    </div>
  );
}
