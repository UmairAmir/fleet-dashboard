import { useEffect, useState } from "react";
import type { FleetSnapshot } from "../types";

const DATA_URL = import.meta.env.VITE_DATA_URL;
const POLL_INTERVAL_MS = 60_000;

export interface FleetDataState {
  snapshot: FleetSnapshot | null;
  error: string | null;
  loading: boolean;
  lastCheckedAt: Date | null;
}

export function useFleetData(): FleetDataState {
  const [state, setState] = useState<FleetDataState>({
    snapshot: null,
    error: DATA_URL ? null : "VITE_DATA_URL is not configured",
    loading: Boolean(DATA_URL),
    lastCheckedAt: null,
  });
  useEffect(() => {
    if (!DATA_URL) return;

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as FleetSnapshot;
        if (cancelled) return;
        setState({
          snapshot: data,
          error: null,
          loading: false,
          lastCheckedAt: new Date(),
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Failed to fetch fleet data",
          loading: false,
          lastCheckedAt: new Date(),
        }));
      }
    }

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return state;
}
