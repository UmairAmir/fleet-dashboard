import type { TruckRecord } from "../types";
import { getStatusInfo } from "../lib/statusMap";

export function StatusBadge({ truck }: { truck: TruckRecord }) {
  const { label, badgeClass } = getStatusInfo(truck);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
    >
      {label}
    </span>
  );
}
