import { useRef, useCallback } from "react";
import { Copy, Navigation, X, FolderOpen } from "lucide-react";

export interface DuplicateFileInfo {
  filename: string;
  vesselName: string;        // name of the vessel folder
  existingFolderId: string;  // folder ID where duplicate exists
  existingFolderPath: string; // human-readable path to navigate to
}

interface Props {
  info: DuplicateFileInfo | null;
  onDismiss: () => void;
  onNavigate: (folderId: string, folderPath: string) => void;
}

export function DuplicateFilePopup({ info, onDismiss, onNavigate }: Props) {
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapCountRef = useRef(0);

  const handleCardInteraction = useCallback(() => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    tapTimerRef.current = setTimeout(() => {
      if (tapCountRef.current >= 2 && info) {
        // Double-tap/double-click — navigate to existing file
        onNavigate(info.existingFolderId, info.existingFolderPath);
        onDismiss();
      }
      tapCountRef.current = 0;
    }, 350);
  }, [info, onNavigate, onDismiss]);

  if (!info) return null;

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onDismiss}
      />

      {/* Modal */}
      <div
        className="relative mx-4 w-full max-w-sm rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-2xl"
        style={{ animation: "scaleUpFadeIn 0.25s ease both" }}
      >
        {/* Header */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <Copy className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-amber-900">
              Duplicate File Detected
            </h3>
            <p className="mt-0.5 text-xs text-amber-700">
              This file already exists in <strong>{info.vesselName}</strong>
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="rounded-lg p-1 text-amber-400 transition hover:bg-amber-100 hover:text-amber-700"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* File name */}
        <div className="mb-4 rounded-xl border border-amber-200 bg-white px-4 py-3">
          <p className="truncate text-sm font-semibold text-slate-700" title={info.filename}>
            {info.filename}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            A copy of this file is already stored in this vessel
          </p>
        </div>

        {/* Existing file location */}
        {info.existingFolderPath && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="truncate text-[11px] text-amber-800" title={info.existingFolderPath}>
              {info.existingFolderPath}
            </p>
          </div>
        )}

        {/* Double-tap hint */}
        <p className="mb-4 text-center text-[11px] text-amber-600">
          <strong>Double-click below</strong> to jump to the existing file's location
        </p>

        {/* Actions */}
        <div className="flex gap-2.5">
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl border border-amber-200 bg-white py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50"
          >
            Dismiss
          </button>
          <button
            onClick={handleCardInteraction}
            onDoubleClick={() => {
              if (info) {
                onNavigate(info.existingFolderId, info.existingFolderPath);
                onDismiss();
              }
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-500 active:scale-95"
          >
            <Navigation className="h-4 w-4" />
            Go to File
          </button>
        </div>

        {/* Tap counter visual hint */}
        {tapCountRef.current === 1 && (
          <p className="mt-2 text-center text-[10px] font-semibold text-amber-500 animate-pulse">
            Tap once more to navigate →
          </p>
        )}
      </div>
    </div>
  );
}
