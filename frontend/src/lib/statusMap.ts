import type { TruckRecord } from "../types";

export interface StatusInfo {
  bucket: string;
  label: string;
  badgeClass: string;
}

const STOPPED: StatusInfo = {
  bucket: "stopped",
  label: "Stopped",
  badgeClass: "bg-red-500/15 text-red-400 border-red-500/30",
};

const IDLE: StatusInfo = {
  bucket: "idle",
  label: "Engine Idle",
  badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const MOVING: StatusInfo = {
  bucket: "moving",
  label: "Moving",
  badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const OFFLINE: StatusInfo = {
  bucket: "offline",
  label: "Offline",
  badgeClass: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const UNKNOWN: StatusInfo = {
  bucket: "unknown",
  label: "Unknown",
  badgeClass: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

// Confirmed against a real snapshot from the tracking API: `st` only ever
// takes these four values (s/i/m/off). There is no distinct waiting/loading/
// unloading code — the API doesn't track that concept. Anything beyond
// "stopped" would have to be inferred separately (e.g. geofencing known
// warehouse/yard coordinates and treating a long stop there as loading).
export function getStatusInfo(truck: TruckRecord): StatusInfo {
  if (truck.st === "s") return STOPPED;
  if (truck.st === "i") return IDLE;
  if (truck.st === "m") return MOVING;
  if (truck.st === "off") return OFFLINE;
  return UNKNOWN;
}

// Display order requested for the dashboard: stopped, engine idle, moving, offline.
export const BUCKET_ORDER = ["stopped", "idle", "moving", "offline", "unknown"];
