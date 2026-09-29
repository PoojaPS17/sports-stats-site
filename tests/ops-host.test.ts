import { test } from "node:test";
import assert from "node:assert/strict";
import type { HostDeps } from "../src/lib/opsHost";

const NOW = Date.parse("2026-09-29T06:00:00Z");

function fakeDeps(over: Partial<HostDeps> = {}): HostDeps {
  const files: Record<string, string> = {
    "/var/lib/update-notifier/updates-available": "12 updates can be applied immediately.\n3 of these updates are standard security updates.\n",
    "/var/backups/sportsdb/restore-test.json": JSON.stringify({ at: "2026-09-01T03:30:00Z", ok: true, tables: 21, rows: 1234567 }),
  };
  const commands: Record<string, string> = {
    "df -P / /var/backups": "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 40000000 30000000 10000000 75% /\n/dev/sda1 40000000 30000000 10000000 75% /var/backups\n",
    "systemctl --failed --no-legend --plain": "sportsdb-scrape@f1.service loaded failed failed Scrape f1\n",
    "systemctl list-timers --all --no-legend --plain 'sportsdb-*'": "Tue 2026-09-29 06:22:00 UTC 22min left Tue 2026-09-29 05:22:00 UTC 38min ago sportsdb-hourly.timer sportsdb-hourly.service\nn/a n/a n/a n/a sportsdb-daily.timer sportsdb-daily.service\n",
    "systemctl show sportsdb-app -p NRestarts,ActiveEnterTimestamp,MainPID": "NRestarts=2\nActiveEnterTimestamp=Mon 2026-09-28 19:40:12 UTC\nMainPID=4242\n",
    "ps -o rss= -p 4242": " 312456\n",
    "journalctl -u sportsdb-app --since -24h -p err --no-pager -q": "line one\nline two\n",
    "timedatectl show -p NTPSynchronized --value": "yes\n",
    "openssl x509 -noout -enddate -in /etc/ssl/cloudflare/sports-db.live.pem": "notAfter=Nov 28 20:06:19 2026 GMT\n",
  };
  return {
    now: () => NOW,
    exec: async (cmd) => {
      if (cmd in commands) return commands[cmd];
      throw new Error(`no such command: ${cmd}`);
    },
    readFile: async (path) => {
      if (path in files) return files[path];
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
    exists: (path) => path in files || path === "/var/run/reboot-required",
    meminfo: async () => "MemTotal: 12000000 kB\nMemFree: 500000 kB\nMemAvailable: 900000 kB\n",
    loadavg: () => [0.5, 0.4, 0.3],
    nodeVersion: () => "v20.20.2",
    ...over,
  };
}

test("hostSection reads every figure from its readers", async () => {
  const { hostSection } = await import("../src/lib/opsHost");
  const s = await hostSection(fakeDeps());
  assert.equal(s.ok, true);
  if (!s.ok) return;
  const d = s.data;
  assert.deepEqual(d.disk, [{ mount: "/", freePercent: 25 }, { mount: "/var/backups", freePercent: 25 }]);
  assert.equal(d.memory.availablePercent, 7.5);
  assert.deepEqual(d.load, [0.5, 0.4, 0.3]);
  assert.deepEqual(d.failedUnits, ["sportsdb-scrape@f1.service"]);
  assert.deepEqual(d.timers, [
    { name: "sportsdb-hourly.timer", next: "Tue 2026-09-29 06:22:00 UTC", last: "Tue 2026-09-29 05:22:00 UTC" },
    { name: "sportsdb-daily.timer", next: null, last: null },
  ]);
  assert.equal(d.app.restarts, 2);
  assert.equal(d.app.startedAt, "2026-09-28T19:40:12.000Z");
  assert.equal(d.app.rssMb, 305);
  assert.equal(d.app.errors24h, 2);
  assert.equal(d.nodeVersion, "v20.20.2");
  assert.deepEqual(d.updates, { pending: 12, security: 3, rebootRequired: true });
  assert.equal(d.ntpSynced, true);
  assert.equal(d.originCertDaysLeft, 60);
  assert.deepEqual(d.restoreTest, { at: "2026-09-01T03:30:00Z", ok: true, tables: 21, rows: 1234567 });
});

test("hostSection answers null for what it cannot read and never fails the section", async () => {
  const { hostSection } = await import("../src/lib/opsHost");
  const s = await hostSection(
    fakeDeps({
      exec: async (cmd) => {
        if (cmd.startsWith("df")) return "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 40000000 30000000 10000000 75% /\n";
        throw new Error("not permitted");
      },
      readFile: async () => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      },
      exists: () => false,
      meminfo: async () => {
        throw new Error("no proc");
      },
    })
  );
  assert.equal(s.ok, true);
  if (!s.ok) return;
  const d = s.data;
  assert.deepEqual(d.disk, [{ mount: "/", freePercent: 25 }]);
  assert.equal(d.memory.availablePercent, null);
  assert.equal(d.failedUnits, null);
  assert.equal(d.timers, null);
  assert.equal(d.app.restarts, null);
  assert.equal(d.app.startedAt, null);
  assert.equal(d.app.rssMb, null);
  assert.equal(d.app.errors24h, null);
  assert.deepEqual(d.updates, { pending: null, security: null, rebootRequired: false });
  assert.equal(d.ntpSynced, null);
  assert.equal(d.originCertDaysLeft, null);
  assert.equal(d.restoreTest, null);
});

test("hostSection de-duplicates disk mounts when df reports the same mount twice", async () => {
  const { hostSection } = await import("../src/lib/opsHost");
  const s = await hostSection(
    fakeDeps({
      exec: async (cmd) => {
        if (cmd === "df -P / /var/backups") {
          return "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 40000000 30000000 10000000 75% /\n/dev/sda1 40000000 30000000 10000000 75% /\n";
        }
        throw new Error(`no such command: ${cmd}`);
      },
    })
  );
  assert.equal(s.ok, true);
  if (!s.ok) return;
  assert.deepEqual(s.data.disk, [{ mount: "/", freePercent: 25 }], "the second row for the same mount is dropped, not appended");
});

test("parseTimerRow finds NEXT and LAST by their own shape, not by a fixed word count", async () => {
  const { parseTimerRow } = await import("../src/lib/opsHost");

  assert.deepEqual(
    parseTimerRow(
      "Tue 2026-09-29 06:00:00 UTC 14min left Tue 2026-09-29 05:45:01 UTC 4min ago sportsdb-scrape-tick.timer sportsdb-scrape-tick.service"
    ),
    { name: "sportsdb-scrape-tick.timer", next: "Tue 2026-09-29 06:00:00 UTC", last: "Tue 2026-09-29 05:45:01 UTC" }
  );

  assert.deepEqual(
    parseTimerRow(
      "Tue 2026-09-29 08:00:00 UTC 1h 30min left Tue 2026-09-29 05:45:01 UTC 4min ago sportsdb-daily.timer sportsdb-daily.service"
    ),
    { name: "sportsdb-daily.timer", next: "Tue 2026-09-29 08:00:00 UTC", last: "Tue 2026-09-29 05:45:01 UTC" },
    "a three word LEFT ('1h 30min left') does not push LAST out of place"
  );

  assert.deepEqual(
    parseTimerRow("Tue 2026-09-29 06:00:00 UTC 14min left n/a n/a sportsdb-once.timer sportsdb-once.service"),
    { name: "sportsdb-once.timer", next: "Tue 2026-09-29 06:00:00 UTC", last: null },
    "a n/a LAST is not misread as part of the NEXT stamp or the LEFT duration"
  );

  assert.deepEqual(
    parseTimerRow("n/a n/a Tue 2026-09-29 05:45:01 UTC 4min ago sportsdb-retired.timer sportsdb-retired.service"),
    { name: "sportsdb-retired.timer", next: null, last: "Tue 2026-09-29 05:45:01 UTC" },
    "a n/a NEXT paired with a n/a LEFT does not consume the real LAST stamp that follows"
  );

  // The VM's systemd prints LEFT and PASSED as bare durations, with no "left" or "ago" word.
  assert.deepEqual(
    parseTimerRow("Tue 2026-09-29 06:15:00 UTC 3min Tue 2026-09-29 06:00:01 UTC 11min sportsdb-scrape-tick.timer sportsdb-scrape-tick.service"),
    { name: "sportsdb-scrape-tick.timer", next: "Tue 2026-09-29 06:15:00 UTC", last: "Tue 2026-09-29 06:00:01 UTC" },
    "bare durations without 'left' or 'ago' are skipped"
  );
  assert.deepEqual(
    parseTimerRow("Tue 2026-09-29 08:17:00 UTC 2h 29min Mon 2026-09-28 08:17:00 UTC 21h sportsdb-scrape-rosters.timer sportsdb-scrape-rosters.service"),
    { name: "sportsdb-scrape-rosters.timer", next: "Tue 2026-09-29 08:17:00 UTC", last: "Mon 2026-09-28 08:17:00 UTC" },
    "a two word bare duration is skipped too"
  );
});

test("a reader that hangs is cut off by the section timeout, not the request", async () => {
  const { hostSection } = await import("../src/lib/opsHost");
  // The section's alarm is unref'd on purpose (a request keeps a server alive, not the alarm), so
  // the test holds the loop open itself while the hung reader never settles.
  const keep = setTimeout(() => {}, 5_000);
  try {
    const s = await hostSection(fakeDeps({ exec: () => new Promise(() => {}) }), 50);
    assert.deepEqual(s, { ok: false, error: "timeout" });
  } finally {
    clearTimeout(keep);
  }
});
