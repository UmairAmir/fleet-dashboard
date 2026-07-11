"""Scrapes fleet status from track.ontrackk.com and writes a snapshot to disk.

Logs in with Playwright, captures the JSON response from the site's internal
/func/fn_objects.php endpoint (fired after login), and writes every tracker's
full raw record to an output JSON file. Exits non-zero and writes nothing if
the scrape fails, so a bad run never clobbers the last known-good snapshot.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv(Path(__file__).resolve().parent / ".env")

LOGIN_URL = "https://track.ontrackk.com/index.php"
TARGET_ENDPOINT = "/func/fn_objects.php"
RESPONSE_TIMEOUT_MS = 30_000

SCRIPT_DIR = Path(__file__).resolve().parent
MAPPING_PATH = SCRIPT_DIR / "truck_mapping.json"
OUTPUT_PATH = Path(os.environ.get("OUTPUT_PATH", "latest.json"))


def load_truck_mapping() -> dict:
    with open(MAPPING_PATH, "r") as f:
        return json.load(f)


def fetch_fleet_data(username: str, password: str) -> dict:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--window-size=1920,1080",
            ],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1920, "height": 1080},
        )
        page = context.new_page()

        try:
            page.goto(LOGIN_URL, wait_until="networkidle")
            page.wait_for_selector("input", timeout=20_000)
            page.locator("input").nth(0).fill(username)
            page.locator("input").nth(1).fill(password)

            with page.expect_response(
                lambda response: TARGET_ENDPOINT in response.url
                and response.status == 200,
                timeout=RESPONSE_TIMEOUT_MS,
            ) as response_info:
                page.get_by_role("button", name="Login").click()

            return response_info.value.json()
        finally:
            browser.close()


def build_snapshot(raw_data: dict, truck_mapping: dict) -> dict:
    trucks = []
    for tracker_id, tracker_info in raw_data.items():
        record = dict(tracker_info)
        record["tracker_id"] = tracker_id
        record["name"] = truck_mapping.get(tracker_id)
        trucks.append(record)

    return {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "trucks": trucks,
    }


def write_snapshot(snapshot: dict, output_path: Path) -> None:
    tmp_path = output_path.with_suffix(output_path.suffix + ".tmp")
    with open(tmp_path, "w") as f:
        json.dump(snapshot, f, indent=2)
    tmp_path.replace(output_path)


def main() -> int:
    username = os.environ.get("TRACK_USERNAME")
    password = os.environ.get("TRACK_PASSWORD")
    if not username or not password:
        print("ERROR: TRACK_USERNAME and TRACK_PASSWORD must be set", file=sys.stderr)
        return 1

    truck_mapping = load_truck_mapping()

    try:
        raw_data = fetch_fleet_data(username, password)
    except Exception as e:
        print(f"ERROR: scrape failed: {e}", file=sys.stderr)
        return 1

    if not raw_data:
        print("ERROR: no fleet data captured", file=sys.stderr)
        return 1

    snapshot = build_snapshot(raw_data, truck_mapping)
    write_snapshot(snapshot, OUTPUT_PATH)
    print(f"Wrote {len(snapshot['trucks'])} truck records to {OUTPUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
