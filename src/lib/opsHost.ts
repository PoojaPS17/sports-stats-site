import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { loadavg } from "node:os";
import { withSectionTimeout, SectionTimeout, type Section } from "./opsReport";

// The host section is the Ops Room's view of the VM without anyone logging in: disk, memory, load,
// failed units and timers, the app process, pending updates, the clock, the origin certificate and
// the monthly restore test. Every reader is injectable so the tests never run df or systemctl, and
// every reader that fails answers null: the Umpire reports "unknown", never a broken section.
export type HostDeps = {
  now: () => number;
  exec: (command: string) => Promise<string>;
  readFile: (path: string) => Promise<string>;
  exists: (path: string) => boolean;
  meminfo: () => Promise<string>;
  loadavg: () => number[];
  nodeVersion: () => string;
};

export type HostData = {
  disk: { mount: string; freePercent: number }[];
  memory: { availablePercent: number | null };
  load: number[];
  failedUnits: string[] | null;
  timers: { name: string; next: string | null; last: string | null }[] | null;
  app: { startedAt: string | null; restarts: number | null; rssMb: number | null; errors24h: number | null };
  nodeVersion: string;
  updates: { pending: number | null; security: number | null; rebootRequired: boolean };
  ntpSynced: boolean | null;
  originCertDaysLeft: number | null;
  restoreTest: { at: string; ok: boolean; tables: number | null; rows: number | null } | null;
};

const ORIGIN_CERT = "/etc/ssl/cloudflare/sports-db.live.pem";
const RESTORE_TEST = "/var/backups/sportsdb/restore-test.json";
const UPDATES = "/var/lib/update-notifier/updates-available";
const REBOOT = "/var/run/reboot-required";

export const realHostDeps: HostDeps = {
  now: () => Date.now(),
  exec: (command) =>
    new Promise((resolve, reject) => {
      const [file, ...args] = splitCommand(command);
      execFile(file, args, { timeout: 5_000, maxBuffer: 1 << 20 }, (err, stdout) => (err ? reject(err) : resolve(String(stdout))));
    }),
  readFile: (path) => readFile(path, "utf8"),
  exists: (path) => existsSync(path),
  meminfo: () => readFile("/proc/meminfo", "utf8"),
  loadavg: () => loadavg(),
  nodeVersion: () => process.version,
};

// Commands are fixed strings in this file, split on spaces with single quotes honoured, so no
// shell is ever involved and nothing from a request can reach execFile.
function splitCommand(command: string): string[] {
  const out: string[] = [];
  for (const m of command.matchAll(/'([^']*)'|(\S+)/g)) out.push(m[1] ?? m[2]);
  return out;
}

async function quiet<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

// systemd prints "Mon 2026-09-28 19:40:12 UTC"; Date.parse wants "2026-09-28 19:40:12 UTC".
function isoFromSystemd(text: string): string | null {
  const t = Date.parse(text.replace(/^[A-Za-z]{3}\s+/, ""));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// One list-timers row: NEXT LEFT LAST PASSED UNIT ACTIVATES. NEXT and LAST are four words each
// ("Tue 2026-09-29 06:22:00 UTC") or the single word "n/a"; LEFT and PASSED are two words or "n/a".
function parseTimerRow(line: string): { name: string; next: string | null; last: string | null } {
  const cols = line.split(/\s+/);
  const name = cols[cols.length - 2];
  const stamp = (from: number) => (cols[from] === "n/a" ? { text: null, used: 1 } : { text: cols.slice(from, from + 4).join(" "), used: 4 });
  const gap = (from: number) => (cols[from] === "n/a" ? 1 : 2);
  const next = stamp(0);
  const last = stamp(next.used + gap(next.used));
  return { name, next: next.text, last: last.text };
}

export async function readHost(deps: HostDeps): Promise<HostData> {
  const [df, failed, timers, show, errors, ntp, cert, updates, restore, mem] = await Promise.all([
    quiet(() => deps.exec("df -P / /var/backups")),
    quiet(() => deps.exec("systemctl --failed --no-legend --plain")),
    quiet(() => deps.exec("systemctl list-timers --all --no-legend --plain 'sportsdb-*'")),
    quiet(() => deps.exec("systemctl show sportsdb-app -p NRestarts,ActiveEnterTimestamp,MainPID")),
    quiet(() => deps.exec("journalctl -u sportsdb-app --since -24h -p err --no-pager -q")),
    quiet(() => deps.exec("timedatectl show -p NTPSynchronized --value")),
    quiet(() => deps.exec(`openssl x509 -noout -enddate -in ${ORIGIN_CERT}`)),
    quiet(() => deps.readFile(UPDATES)),
    quiet(() => deps.readFile(RESTORE_TEST)),
    quiet(() => deps.meminfo()),
  ]);

  const disk = (df ?? "")
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length >= 6)
    .map((cols) => ({ mount: cols[5], freePercent: pct(Number(cols[3]), Number(cols[1])) }));

  const memKb = (key: string) => Number((mem ?? "").match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1] ?? NaN);
  const availablePercent = mem && !Number.isNaN(memKb("MemTotal")) && !Number.isNaN(memKb("MemAvailable")) ? pct(memKb("MemAvailable"), memKb("MemTotal")) : null;

  const failedUnits = failed === null ? null : failed.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((u) => u.length > 0);
  const timerRows = timers === null ? null : timers.split("\n").map((l) => l.trim()).filter((l) => l.length > 0).map(parseTimerRow);

  const prop = (key: string) => show?.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? null;
  const restarts = prop("NRestarts");
  const started = prop("ActiveEnterTimestamp");
  const pid = prop("MainPID");
  const rss = pid && pid !== "0" && /^\d+$/.test(pid) ? await quiet(() => deps.exec(`ps -o rss= -p ${pid}`)) : null;
  const rssMb = rss ? Math.round(Number(rss.trim()) / 1024) : null;
  const errors24h = errors === null ? null : errors.split("\n").filter((l) => l.trim().length > 0).length;

  const pending = updates?.match(/(\d+) updates? can be applied/)?.[1];
  const security = updates?.match(/(\d+) of these updates (?:are|is) (?:a )?standard security/)?.[1];

  let originCertDaysLeft: number | null = null;
  const notAfter = cert?.match(/notAfter=(.*)/)?.[1];
  if (notAfter) {
    const t = Date.parse(notAfter);
    if (!Number.isNaN(t)) originCertDaysLeft = Math.floor((t - deps.now()) / 86_400_000);
  }

  let restoreTest: HostData["restoreTest"] = null;
  if (restore) {
    try {
      const r = JSON.parse(restore) as { at?: unknown; ok?: unknown; tables?: unknown; rows?: unknown };
      if (typeof r.at === "string" && typeof r.ok === "boolean") {
        restoreTest = { at: r.at, ok: r.ok, tables: typeof r.tables === "number" ? r.tables : null, rows: typeof r.rows === "number" ? r.rows : null };
      }
    } catch {
      restoreTest = null;
    }
  }

  return {
    disk,
    memory: { availablePercent },
    load: deps.loadavg().map((n) => Math.round(n * 100) / 100),
    failedUnits,
    timers: timerRows,
    app: { startedAt: started ? isoFromSystemd(started) : null, restarts: restarts === null ? null : Number(restarts), rssMb, errors24h },
    nodeVersion: deps.nodeVersion(),
    updates: { pending: pending ? Number(pending) : null, security: security ? Number(security) : null, rebootRequired: deps.exists(REBOOT) },
    ntpSynced: ntp === null ? null : ntp.trim() === "yes",
    originCertDaysLeft,
    restoreTest,
  };
}

export async function hostSection(deps: HostDeps = realHostDeps, timeoutMs?: number): Promise<Section<HostData>> {
  try {
    return { ok: true, data: await withSectionTimeout(readHost(deps), timeoutMs) };
  } catch (err) {
    console.warn(`[opsReport] host failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, error: err instanceof SectionTimeout ? "timeout" : "section failed" };
  }
}
