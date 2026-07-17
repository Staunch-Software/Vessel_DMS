import { useState } from "react";
import { Loader2, Ship, X } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreate: (name: string, imo: string) => Promise<void>;
}

export function CreateVesselModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [imo, setImo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imoValid = imo === "" || /^\d{7}$/.test(imo);

  const submit = async () => {
    if (!name.trim() || !imoValid) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), imo.trim());
      onClose();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Could not create vessel.";
      setError(msg);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-fg/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="dms-card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Ship className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-fg">
                New Vessel
              </h2>
              <p className="text-xs text-muted">
                Provisions the full folder structure across all 3 main folders.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-subtle hover:bg-surface2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1.5 block text-sm font-medium text-fg">
          Vessel name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. MV Pacific Trader"
          className="dms-input w-full px-3 py-2 text-sm"
        />

        <label className="mb-1.5 mt-4 block text-sm font-medium text-fg">
          IMO number
        </label>
        <input
          value={imo}
          onChange={(e) =>
            setImo(e.target.value.replace(/\D/g, "").slice(0, 7))
          }
          onKeyDown={(e) => e.key === "Enter" && submit()}
          inputMode="numeric"
          placeholder="7 digits, e.g. 9074729"
          className={
            "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 " +
            (imoValid
              ? "dms-input border-border"
              : "border-error/50 focus:border-error focus:ring-error/20")
          }
        />
        {!imoValid && (
          <p className="mt-1 text-xs text-error">
            IMO number must be exactly 7 digits.
          </p>
        )}

        {error && (
          <p className="mt-2 text-sm text-error">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface2"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !imoValid}
            className="dms-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Vessel
          </button>
        </div>
      </div>
    </div>
  );
}
