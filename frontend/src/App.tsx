import { useMemo, useState } from "react";
import type { TruckRecord } from "./types";
import { useFleetData } from "./hooks/useFleetData";
import { FleetTable } from "./components/FleetTable";
import { TriggerScrapeButton } from "./components/TriggerScrapeButton";
import { getStatusInfo, BUCKET_ORDER } from "./lib/statusMap";
import { formatRelativeTime, minutesSince, parseDurationSeconds } from "./lib/time";
import { matchesCity } from "./lib/geography";

const STALE_THRESHOLD_MINUTES = 15;
const LONG_DURATION_SECONDS = 3600;

type Tab = "all" | "long" | "operations";

function sortByStatusThenDuration(trucks: TruckRecord[]): TruckRecord[] {
  return [...trucks].sort((a, b) => {
    const bucketDiff =
      BUCKET_ORDER.indexOf(getStatusInfo(a).bucket) - BUCKET_ORDER.indexOf(getStatusInfo(b).bucket);
    if (bucketDiff !== 0) return bucketDiff;
    return parseDurationSeconds(b.ststr) - parseDurationSeconds(a.ststr);
  });
}

function sortByDuration(trucks: TruckRecord[]): TruckRecord[] {
  return [...trucks].sort((a, b) => parseDurationSeconds(b.ststr) - parseDurationSeconds(a.ststr));
}

function App() {
  const { snapshot, error, loading, lastCheckedAt } = useFleetData();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const trucks = snapshot?.trucks ?? [];

  const applySearch = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (list: TruckRecord[]) =>
      term
        ? list.filter(
            (truck) =>
              truck.name?.toLowerCase().includes(term) || truck.tracker_id.toLowerCase().includes(term),
          )
        : list;
  }, [search]);

  const longStoppedTrucks = useMemo(
    () =>
      trucks.filter((truck) => {
        const bucket = getStatusInfo(truck).bucket;
        return (bucket === "stopped" || bucket === "idle") && parseDurationSeconds(truck.ststr) > LONG_DURATION_SECONDS;
      }),
    [trucks],
  );

  const stoppedTrucks = useMemo(() => trucks.filter((truck) => truck.st === "s"), [trucks]);
  const karachiTrucks = useMemo(() => stoppedTrucks.filter((t) => matchesCity(t.address, "karachi")), [stoppedTrucks]);
  const lahoreTrucks = useMemo(() => stoppedTrucks.filter((t) => matchesCity(t.address, "lahore")), [stoppedTrucks]);
  const otherStoppedTrucks = useMemo(
    () => stoppedTrucks.filter((t) => !matchesCity(t.address, "karachi") && !matchesCity(t.address, "lahore")),
    [stoppedTrucks],
  );

  const isStale = snapshot ? minutesSince(snapshot.fetched_at) > STALE_THRESHOLD_MINUTES : false;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Fleet Dashboard</h1>
          <div className="flex flex-col items-end gap-2">
            {snapshot && (
              <p className="text-sm text-gray-400">
                Last scraped {formatRelativeTime(snapshot.fetched_at)}
                {lastCheckedAt && (
                  <span className="text-gray-600"> · checked {formatRelativeTime(lastCheckedAt.toISOString())}</span>
                )}
              </p>
            )}
            <TriggerScrapeButton />
          </div>
        </header>

        {isStale && (
          <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            Data is more than {STALE_THRESHOLD_MINUTES} minutes old — the scrape workflow may be broken.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Failed to load fleet data: {error}
          </div>
        )}

        {loading && !snapshot && (
          <div className="py-16 text-center text-sm text-gray-400">Loading fleet data…</div>
        )}

        {snapshot && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search by truck name or tracker ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm placeholder:text-gray-500 focus:border-white/20 focus:outline-none sm:w-64"
              />
              <div className="flex flex-wrap gap-1.5">
                <FilterButton active={tab === "all"} onClick={() => setTab("all")}>
                  All ({trucks.length})
                </FilterButton>
                <FilterButton active={tab === "long"} onClick={() => setTab("long")}>
                  &gt;1 Hour ({longStoppedTrucks.length})
                </FilterButton>
                <FilterButton active={tab === "operations"} onClick={() => setTab("operations")}>
                  Operations ({stoppedTrucks.length})
                </FilterButton>
              </div>
            </div>

            {tab === "all" && <FleetTable trucks={sortByStatusThenDuration(applySearch(trucks))} />}
            {tab === "long" && <FleetTable trucks={sortByStatusThenDuration(applySearch(longStoppedTrucks))} />}
            {tab === "operations" && (
              <div className="space-y-6">
                <CitySection title="Karachi" trucks={sortByDuration(applySearch(karachiTrucks))} />
                <CitySection title="Lahore" trucks={sortByDuration(applySearch(lahoreTrucks))} />
                <CitySection title="Other" trucks={sortByDuration(applySearch(otherStoppedTrucks))} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-white/30 bg-white/10 text-white"
          : "border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function CitySection({ title, trucks }: { title: string; trucks: TruckRecord[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-300">
        {title} <span className="font-normal text-gray-500">({trucks.length})</span>
      </h2>
      <FleetTable trucks={trucks} />
    </section>
  );
}

export default App;
