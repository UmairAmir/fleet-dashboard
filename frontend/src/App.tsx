import { useMemo, useState } from "react";
import { useFleetData } from "./hooks/useFleetData";
import { FleetTable } from "./components/FleetTable";
import { TriggerScrapeButton } from "./components/TriggerScrapeButton";
import { getStatusInfo, BUCKET_ORDER } from "./lib/statusMap";
import { formatRelativeTime, minutesSince } from "./lib/time";

const STALE_THRESHOLD_MINUTES = 15;

function App() {
  const { snapshot, error, loading, lastCheckedAt } = useFleetData();
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<string>("all");

  const trucks = snapshot?.trucks ?? [];

  const buckets = useMemo(() => {
    const seen = new Map<string, string>();
    for (const truck of trucks) {
      const info = getStatusInfo(truck);
      seen.set(info.bucket, info.label);
    }
    return Array.from(seen.entries()).sort(
      (a, b) => BUCKET_ORDER.indexOf(a[0]) - BUCKET_ORDER.indexOf(b[0]),
    );
  }, [trucks]);

  const filteredTrucks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return trucks
      .filter((truck) => {
        if (bucket !== "all" && getStatusInfo(truck).bucket !== bucket) return false;
        if (!term) return true;
        return (
          truck.name?.toLowerCase().includes(term) ||
          truck.tracker_id.toLowerCase().includes(term)
        );
      })
      .sort(
        (a, b) =>
          BUCKET_ORDER.indexOf(getStatusInfo(a).bucket) -
          BUCKET_ORDER.indexOf(getStatusInfo(b).bucket),
      );
  }, [trucks, search, bucket]);

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
                <FilterButton active={bucket === "all"} onClick={() => setBucket("all")}>
                  All ({trucks.length})
                </FilterButton>
                {buckets.map(([key, label]) => (
                  <FilterButton key={key} active={bucket === key} onClick={() => setBucket(key)}>
                    {label} ({trucks.filter((t) => getStatusInfo(t).bucket === key).length})
                  </FilterButton>
                ))}
              </div>
            </div>

            <FleetTable trucks={filteredTrucks} />
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

export default App;
