import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2, Ship, X, Search } from "lucide-react";
import { VESSEL_TYPES, type VesselInput } from "../api";

interface Props {
  vessel: {
    id: string;
    name: string;
    imo?: string | null;
    shipyard?: string | null;
    hull_number?: string | null;
    vessel_type?: string | null;
  } | null;
  onClose: () => void;
  onUpdate: (vesselId: string, data: Partial<VesselInput>) => Promise<void>;
  vessels: Array<{
    id: string;
    name: string;
    imo?: string | null;
    shipyard?: string | null;
    hull_number?: string | null;
    vessel_type?: string | null;
  }>;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

const normalizeVesselName = (name: string) => {
  if (!name) return "";
  return name.replace(/\s/g, "").replace(/_/g, "").replace(/'/g, "").replace(/"/g, "").toLowerCase();
};

export function UpdateVesselModal({ vessel, onClose, onUpdate, vessels }: Props) {
  const [selectedVessel, setSelectedVessel] = useState<any>(vessel);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [name, setName] = useState("");
  const [imo, setImo] = useState("");
  const [imoTouched, setImoTouched] = useState(false);
  const [shipyard, setShipyard] = useState("");
  const [hull, setHull] = useState("");
  const [vesselType, setVesselType] = useState("");
  
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendNameError, setBackendNameError] = useState<string | null>(null);

  const typeButtonRef = useRef<HTMLButtonElement>(null);

  // Sync edit form inputs when selectedVessel changes
  useEffect(() => {
    if (selectedVessel) {
      setName(selectedVessel.name || "");
      setImo(selectedVessel.imo || "");
      setShipyard(selectedVessel.shipyard || "");
      setHull(selectedVessel.hull_number || "");
      setVesselType(selectedVessel.vessel_type || "");
      setImoTouched(false);
      setBackendNameError(null);
      setError(null);
    }
  }, [selectedVessel]);

  const imoValid = /^\d{7}$/.test(imo);
  const normalizedInput = normalizeVesselName(name);
  
  // Exclude current vessel from duplicate checks
  const isDuplicate = selectedVessel && name.trim() !== "" && name.trim().toLowerCase() !== selectedVessel.name.toLowerCase() && vessels.some(
    (v) => v.id !== selectedVessel.id && normalizeVesselName(v.name) === normalizedInput
  );
  const nameError = isDuplicate ? "Vessel name already exists." : backendNameError;

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

  useEffect(() => {
    if (!showTypeDropdown) return;
    const update = () => {
      if (typeButtonRef.current) {
        setDropdownRect(typeButtonRef.current.getBoundingClientRect());
      }
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [showTypeDropdown]);

  const handleOpenDropdown = () => {
    if (typeButtonRef.current) {
      setDropdownRect(typeButtonRef.current.getBoundingClientRect());
    }
    setShowTypeDropdown((prev) => !prev);
  };

  const handleSelectType = (t: string) => {
    setVesselType(t);
    setShowTypeDropdown(false);
  };

  const submit = async () => {
    if (!selectedVessel) return;
    setImoTouched(true);
    if (!name.trim() || !imoValid || isDuplicate) return;
    setBusy(true);
    setError(null);
    setBackendNameError(null);
    try {
      await onUpdate(selectedVessel.id, {
        name: name.trim(),
        imo: imo.trim(),
        shipyard: shipyard.trim(),
        hull_number: hull.trim(),
        vessel_type: vesselType || "",
      });
      // Update in local state list of vessels if successful so that the left pane gets updated instantly
      selectedVessel.name = name.trim();
      selectedVessel.imo = imo.trim();
      selectedVessel.shipyard = shipyard.trim();
      selectedVessel.hull_number = hull.trim();
      selectedVessel.vessel_type = vesselType || "";
      
      // Keep it selected but turn off loading
      setBusy(false);
      
      // Let's also close the modal or display a success banner? Close is standard.
      onClose();
    } catch (e: unknown) {
      const data = (e as { response?: { data?: { detail?: string; message?: string } } })?.response?.data;
      const msg = data?.message || data?.detail || "Could not update vessel.";
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
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-fg/50 p-0 sm:p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-4xl bg-surface rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden animate-scale-up flex flex-col h-[600px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0 bg-surface">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
              <Ship className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg">Update Vessel Directory</h2>
              <p className="text-xs text-muted">Select a vessel and edit its database fields</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-hover hover:text-fg transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Master-Detail Content Body */}
        <div className="flex flex-1 min-h-0 divide-x divide-border flex-col sm:flex-row">
          
          {/* Left Column: Vessel List (Master) */}
          <div className="w-full sm:w-80 flex flex-col bg-surface-hover shrink-0 min-h-0">
            {/* Search Box */}
            <div className="p-3 border-b border-border bg-surface shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
                <input
                  type="text"
                  placeholder="Search vessels..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
            </div>

            {/* List scroll container */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredVessels.length === 0 ? (
                <p className="text-center text-xs text-muted py-8">No vessels found</p>
              ) : (
                filteredVessels.map((v) => {
                  const active = selectedVessel?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVessel(v)}
                      className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition text-xs font-semibold cursor-pointer ${
                        active
                          ? "bg-brand-600 text-white shadow-sm"
                          : "text-fg hover:bg-surface"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div className="truncate">{v.name}</div>
                        <div className={`text-[10px] mt-0.5 ${active ? "text-brand-100" : "text-muted"}`}>
                          IMO: {v.imo || "—"}
                        </div>
                      </div>
                      <Ship className={`h-4 w-4 shrink-0 ${active ? "text-brand-200" : "text-slate-400"}`} />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Vessel Editor Details (Detail) */}
          <div className="flex-1 flex flex-col bg-surface min-h-0 overflow-y-auto">
            {selectedVessel ? (
              <div className="p-6 space-y-4 flex-1">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <h3 className="text-sm font-bold text-fg">Vessel Details</h3>
                  <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-brand-500">
                    ID: {selectedVessel.id}
                  </span>
                </div>

                {error && (
                  <div className="rounded-lg bg-error-bg border border-error/20 p-3.5 text-xs text-error">
                    {error}
                  </div>
                )}

                {/* Vessel Name */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-fg">Vessel Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Bow Fighter"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setBackendNameError(null);
                    }}
                    className={inputCls}
                    disabled={busy}
                  />
                  {nameError && (
                    <p className="text-[11px] font-semibold text-error">{nameError}</p>
                  )}
                </div>

                {/* IMO Number */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-fg">IMO Number *</label>
                  <input
                    type="text"
                    placeholder="Exactly 7 digits"
                    maxLength={7}
                    value={imo}
                    onChange={(e) => {
                      setImo(e.target.value);
                      setImoTouched(true);
                    }}
                    className={inputCls}
                    disabled={busy}
                  />
                  {imoTouched && !imoValid && (
                    <p className="text-[11px] font-semibold text-error">
                      IMO number must be exactly 7 digits.
                    </p>
                  )}
                </div>

                {/* Shipyard & Hull */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-fg">Shipyard</label>
                    <input
                      type="text"
                      placeholder="Shipyard name"
                      value={shipyard}
                      onChange={(e) => setShipyard(e.target.value)}
                      className={inputCls}
                      disabled={busy}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-fg">Hull Number</label>
                    <input
                      type="text"
                      placeholder="Hull number"
                      value={hull}
                      onChange={(e) => setHull(e.target.value)}
                      className={inputCls}
                      disabled={busy}
                    />
                  </div>
                </div>

                {/* Vessel Type */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-fg">Vessel Type</label>
                  <div className="relative">
                    <button
                      ref={typeButtonRef}
                      onClick={handleOpenDropdown}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-50 cursor-pointer"
                      disabled={busy}
                    >
                      <span>{vesselType || "Select vessel type"}</span>
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    </button>

                    {/* Portal Dropdown Menu */}
                    {showTypeDropdown &&
                      dropdownRect &&
                      createPortal(
                        <>
                          <div
                            className="fixed inset-0 z-50 cursor-default"
                            onClick={() => setShowTypeDropdown(false)}
                          />
                          <div
                            className="fixed z-50 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl text-left"
                            style={{
                              top: `${dropdownRect.bottom + window.scrollY}px`,
                              left: `${dropdownRect.left + window.scrollX}px`,
                              width: `${dropdownRect.width}px`,
                            }}
                          >
                            <button
                              onClick={() => handleSelectType("")}
                              className="w-full rounded-md px-3 py-2 text-left text-xs font-medium text-slate-400 hover:bg-surface-hover transition cursor-pointer"
                            >
                              None
                            </button>
                            {Array.from(VESSEL_TYPES).map((t) => (
                              <button
                                key={t}
                                onClick={() => handleSelectType(t)}
                                className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-fg hover:bg-surface-hover transition cursor-pointer"
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </>,
                        document.body
                      )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted">
                <Ship className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-sm font-semibold">No Vessel Selected</p>
                <p className="text-xs text-slate-400 mt-1">Please click on a vessel from the left panel to edit its details.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 bg-surface-hover shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-muted hover:bg-surface-hover transition cursor-pointer"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !selectedVessel || !name.trim() || !imoValid || isDuplicate}
            className="flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
