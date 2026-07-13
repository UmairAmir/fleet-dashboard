import { Fragment, useState } from "react";
import type { TruckRecord } from "../types";
import { StatusBadge } from "./StatusBadge";

export function FleetTable({ trucks }: { trucks: TruckRecord[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(trackerId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(trackerId)) next.delete(trackerId);
      else next.add(trackerId);
      return next;
    });
  }

  if (trucks.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 py-16 text-center text-sm text-gray-400">
        No trucks match the current filter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-gray-400">
          <tr>
            <th className="px-4 py-3 font-medium">Truck</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Raw status text</th>
            <th className="px-4 py-3 font-medium">Location</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {trucks.map((truck) => {
            const isExpanded = expanded.has(truck.tracker_id);
            return (
              <Fragment key={truck.tracker_id}>
                <tr
                  onClick={() => toggle(truck.tracker_id)}
                  className="cursor-pointer hover:bg-white/5"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-100">
                    {truck.name ?? (
                      <span className="text-gray-500">Unmapped</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge truck={truck} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-300">
                    {truck.ststr ?? "—"}
                  </td>
                  <td className="max-w-xs whitespace-normal break-words px-4 py-3 text-gray-300">
                    {truck.address ?? "—"}
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={4} className="bg-black/20 px-4 py-3">
                      <pre className="max-w-full overflow-x-auto text-xs text-gray-400">
                        {JSON.stringify(truck, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
