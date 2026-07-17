import { useState } from "react";
import { Loader2, Ship, X } from "lucide-react";
import { VESSEL_TYPES, type VesselInput } from "../api";

interface Props {
  onClose: () => void;
  onCreate: (data: VesselInput) => Promise<void>;
  vessels: Array<{ name: string }>;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

const normalizeVesselName = (name: string) => {
  if (!name) return "";
  return name.replace(/\s/g, "").replace(/_/g, "").replace(/'/g, "").replace(/"/g, "").toLowerCase();
};

export function CreateVesselModal({ onClose, onCreate, vessels }: Props) {
  const [name, setName] = useState("");
  const [imo, setImo] = useState("");
  const [imoTouched, setImoTouched] = useState(false);
  const [shipyard, setShipyard] = useState("");
  const [hull, setHull] = useState("");
  const [vesselType, setVesselType] = useState("");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendNameError, setBackendNameError] = useState<string | null>(null);

  const imoValid = /^\d{7}$/.test(imo);
  const normalizedInput = normalizeVesselName(name);
  const isDuplicate = name.trim() !== "" && vessels.some(
    (v) => normalizeVesselName(v.name) === normalizedInput
  );
  const nameError = isDuplicate ? "Vessel name already exists." : backendNameError;

  const submit = async () => {
    setImoTouched(true);
    if (!name.trim() || !imoValid || isDuplicate) return;
    setBusy(true);
    setError(null);
    setBackendNameError(null);
    try {
      await onCreate({
        name: name.trim(),
        imo: imo.trim(),
        shipyard: shipyard.trim(),
        hull_number: hull.trim(),
        vessel_type: vesselType || undefined,
      });
      onClose();
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { detail?: string; message?: string } } })?.response?.data;
      const msg = data?.message || data?.detail || "Could not create vessel.";
      if (msg === "Vessel name already exists.") {
        setBackendNameError("Vessel name already exists.");
      } else {
        setError(msg);
      }
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-fg/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
              <Ship className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">New Vessel</h2>
              <p className="text-xs text-slate-500">
                Provisions the full folder structure across all 3 main folders.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Vessel name <span className="text-rose-500">*</span>
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setBackendNameError(null);
            setError(null);
          }}
          placeholder="e.g. MV Pacific Trader"
          className={
            "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 " +
            (nameError
              ? "border-rose-300 focus:border-rose-400 focus:ring-rose-100"
              : "border-slate-300 focus:border-brand-400 focus:ring-brand-100")
          }
        />
        {nameError && (
          <p className="mt-1 text-xs text-rose-600">{nameError}</p>
        )}

        <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">
          IMO number <span className="text-rose-500">*</span>
        </label>
        <input
          value={imo}
          onChange={(e) => {
            setImo(e.target.value.replace(/\D/g, "").slice(0, 7));
            setImoTouched(true);
          }}
          inputMode="numeric"
          placeholder="7 digits, e.g. 9074729"
          className={
            "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 " +
            (!imoTouched || imoValid
              ? "dms-input border-border"
              : "border-rose-300 focus:border-rose-400 focus:ring-rose-100")
          }
        />
        {imoTouched && !imoValid && (
          <p className="mt-1 text-xs text-rose-600">
            {imo === "" ? "IMO number is required." : "IMO number must be exactly 7 digits."}
          </p>
        )}

        <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">
          Ship yard name
        </label>
        <input
          value={shipyard}
          onChange={(e) => setShipyard(e.target.value)}
          placeholder="e.g. Hyundai Heavy Industries"
          className={inputCls}
        />

        <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">Hull number</label>
        <input
          value={hull}
          onChange={(e) => setHull(e.target.value)}
          placeholder="e.g. H2456"
          className={inputCls}
        />

        <label className="mb-1.5 mt-4 block text-sm font-medium text-slate-700">Vessel type</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTypeDropdown(!showTypeDropdown)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-left bg-white focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 flex items-center justify-between"
          >
            <span className={vesselType ? "text-slate-800" : "text-slate-400"}>
              {vesselType || "Select a type…"}
            </span>
            <span className="pointer-events-none flex items-center pr-1 text-slate-500">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </button>

          {showTypeDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowTypeDropdown(false)} />
              <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg z-20">
                <button
                  type="button"
                  onClick={() => {
                    setVesselType("");
                    setShowTypeDropdown(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-50"
                >
                  Select a type…
                </button>
                {VESSEL_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setVesselType(t);
                      setShowTypeDropdown(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-slate-50 ${
                      vesselType === t ? "bg-slate-50 font-medium text-brand-600" : "text-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted hover:bg-surface2"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !imoValid || isDuplicate}
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
