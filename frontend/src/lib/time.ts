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
