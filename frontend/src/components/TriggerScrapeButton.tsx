import { useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function TriggerScrapeButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function trigger() {
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/trigger-scrape", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? `Request failed (${res.status})`);
        return;
      }
      setStatus("success");
      setMessage("Triggered — new data should appear within a minute or two.");
    } catch {
      setStatus("error");
      setMessage("Failed to reach the server.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={trigger}
        disabled={status === "loading"}
        className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading" ? "Triggering…" : "Force scrape now"}
      </button>
      {message && (
        <span className={`text-xs ${status === "error" ? "text-red-300" : "text-emerald-300"}`}>
          {message}
        </span>
      )}
    </div>
  );
}
