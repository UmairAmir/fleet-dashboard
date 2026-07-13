export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSeconds = Math.round((Date.now() - then) / 1000);

  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  return `${diffHours} hr ago`;
}

export function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

const DURATION_UNIT_SECONDS: Record<string, number> = {
  d: 86400,
  h: 3600,
  min: 60,
  s: 1,
};

// Parses durations like "Stopped 1 h 9 min 54 s" or "Offline 34 d 12 h 45 min 20 s"
// (the `ststr` raw status text) into total seconds, for sorting by duration.
export function parseDurationSeconds(text?: string | null): number {
  if (!text) return 0;
  let total = 0;
  for (const [, value, unit] of text.matchAll(/(\d+)\s*(d|h|min|s)\b/g)) {
    total += Number(value) * DURATION_UNIT_SECONDS[unit];
  }
  return total;
}
