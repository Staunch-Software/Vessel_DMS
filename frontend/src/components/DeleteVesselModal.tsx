import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Ship, Trash2, X, Search } from "lucide-react";
import type { Vessel } from "../api";

interface Props {
  vessel: Vessel | null;
  onClose: () => void;
  onDelete: (vesselId: string, vesselName: string) => Promise<void>;
  vessels: Vessel[];
}

export function DeleteVesselModal({ vessel, onClose, onDelete, vessels }: Props) {
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(vessel);
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter vessels list based on search query
  const filteredVessels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return vessels;
    return vessels.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        (v.imo && v.imo.toLowerCase().includes(q))
    );
  }, [vessels, searchQuery]);

  const handleDelete = async () => {
    if (!selectedVessel) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(selectedVessel.id, selectedVessel.name);
      onClose();
    } catch (err: any) {
      console.error("Delete vessel error:", err);
      const msg = err.response?.data?.message || err.message || "Failed to delete vessel.";
      setError(msg);
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-rose-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Delete Vessel</h2>
              <p className="text-xs text-slate-500">
                Move a vessel and its folder structure into the Recycle Bin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 max-h-[70vh]">
          {/* Left Column: Vessel Selector */}
          <div className="p-4 bg-slate-50/50 flex flex-col gap-3">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Select Vessel ({vessels.length})
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search vessels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs focus:border-brand-500 focus:outline-none bg-white"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 max-h-60 md:max-h-72 pr-1">
              {filteredVessels.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-4">No vessels found</div>
              ) : (
                filteredVessels.map((v) => {
                  const isSelected = selectedVessel?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVessel(v);
                        setError(null);
                      }}
                      className={`w-full text-left p-2.5 rounded-lg text-xs transition flex items-center justify-between gap-2 border ${
                        isSelected
                          ? "bg-rose-50 border-rose-200 text-rose-900 font-medium"
                          : "bg-white border-slate-100 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <div className="font-semibold truncate">{v.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {v.imo ? `IMO: ${v.imo}` : "No IMO"}
                        </div>
                      </div>
                      {isSelected && <Trash2 className="h-3.5 w-3.5 text-rose-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Deletion Confirmation Details */}
          <div className="md:col-span-2 p-6 flex flex-col justify-between gap-6">
            {!selectedVessel ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 py-12">
                <Ship className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm font-medium">Please select a vessel from the list to delete.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Warning banner */}
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200/80 p-3.5 text-amber-800">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <p className="font-semibold">Move vessel to Recycle Bin?</p>
                    <p className="mt-0.5 text-amber-700">
                      Deleting <strong>{selectedVessel.name}</strong> will remove it from the active vessel list and move its folder structure to the <strong>Recycle Bin</strong>. You can restore or permanently purge it from the Recycle Bin anytime.
                    </p>
                  </div>
                </div>

                {/* Vessel Information Card */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Vessel Summary
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block">Vessel Name</span>
                      <span className="font-semibold text-slate-800">{selectedVessel.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">IMO Number</span>
                      <span className="font-medium text-slate-700">{selectedVessel.imo || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Shipyard</span>
                      <span className="font-medium text-slate-700">{selectedVessel.shipyard || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Hull Number</span>
                      <span className="font-medium text-slate-700">{selectedVessel.hull_number || "—"}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block">Vessel Type</span>
                      <span className="font-medium text-slate-700">{selectedVessel.vessel_type || "—"}</span>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 font-medium">
                    {error}
                  </div>
                )}
              </div>
            )}

            {/* Footer Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy || !selectedVessel}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-500 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Deleting Vessel...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Vessel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
