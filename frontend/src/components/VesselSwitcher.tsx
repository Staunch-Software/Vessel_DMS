import { Ship } from "lucide-react";
import type { Vessel } from "../api";

export function VesselSwitcher({
  vessels,
  selected,
  onSelect,
}: {
  vessels: Vessel[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="dms-input flex items-center gap-2 rounded-lg pl-2.5 pr-1">
      <Ship className="h-4 w-4 text-primary" />
      <select
        value={selected ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="bg-transparent py-1.5 pr-1 text-sm text-fg focus:outline-none"
        title="Filter the explorer to one vessel"
      >
        <option value="">All vessels</option>
        {vessels.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.imo ? ` (IMO ${v.imo})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
