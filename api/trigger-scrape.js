const OWNER = "UmairAmir";
const REPO = "fleet-dashboard";
const COOLDOWN_MINUTES = 2;

const GITHUB_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) {
    res.status(500).json({ error: "Server is not configured (missing token)" });
    return;
  }

  try {
    const dataRes = await fetch(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/data/latest.json`,
      { cache: "no-store" },
    );
    if (dataRes.ok) {
      const data = await dataRes.json();
      const minutesSince = (Date.now() - new Date(data.fetched_at).getTime()) / 60_000;
      if (minutesSince < COOLDOWN_MINUTES) {
        res.status(429).json({
          error: `Data was already scraped ${Math.max(0, Math.round(minutesSince))} min ago — try again shortly.`,
        });
        return;
      }
    }

    const runsRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/scrape.yml/runs?per_page=5`,
      { headers: GITHUB_HEADERS(token) },
    );
    if (runsRes.ok) {
      const runsData = await runsRes.json();
      const active = (runsData.workflow_runs ?? []).some((run) =>
        ["queued", "in_progress", "waiting", "requested", "pending"].includes(run.status),
      );
      if (active) {
        res.status(429).json({ error: "A scrape is already running — check back in a minute." });
        return;
      }
    }

    const dispatchRes = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/scrape.yml/dispatches`,
      {
        method: "POST",
        headers: { ...GITHUB_HEADERS(token), "Content-Type": "application/json" },
        body: JSON.stringify({ ref: "main" }),
      },
    );

    if (!dispatchRes.ok) {
      res.status(502).json({ error: `GitHub API error (${dispatchRes.status})` });
      return;
    }

    res.status(200).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to trigger scrape" });
  }
};
