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
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 ring-1 ring-brand-100">
              <Ship className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">
                New Vessel
              </h2>
              <p className="text-xs text-slate-500">
                Provisions the full folder structure across all 3 main folders.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Vessel name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. MV Pacific Trader"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />

        <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">
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
              ? "border-slate-300 focus:border-brand-400 focus:ring-brand-100"
              : "border-rose-300 focus:border-rose-400 focus:ring-rose-100")
          }
        />
        {!imoValid && (
          <p className="mt-1 text-xs text-rose-600">
            IMO number must be exactly 7 digits.
          </p>
        )}

        {error && (
          <p className="mt-2 text-sm text-rose-600">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !imoValid}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-500 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Vessel
          </button>
        </div>
      </div>
    </div>
  );
}
