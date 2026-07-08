import { Ship } from "lucide-react";
import type { Vessel } from "../api";

export function VesselSwitcher({
  vessels,
  selected,
  onSelect,
}: {
  vessels: Vessel[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white pl-2.5 pr-1">
      <Ship className="h-4 w-4 text-brand-500" />
      <select
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="bg-transparent py-1.5 pr-1 text-sm text-slate-700 focus:outline-none"
        title="Filter the explorer to one vessel"
      >
        <option value="">All vessels</option>
        {vessels.map((v) => (
          <option key={v.id} value={v.name}>
            {v.name}
            {v.imo ? ` (IMO ${v.imo})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
