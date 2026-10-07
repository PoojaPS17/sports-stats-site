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

// One list-timers row: NEXT LEFT LAST PASSED UNIT ACTIVATES. NEXT and LAST are each a stamp of
// four words ("Tue 2026-09-29 06:22:00 UTC", the second word matching YYYY-MM-DD) or a single
// empty marker: "-" on systemd 255 (the VM), "n/a" on older releases. LEFT and PASSED vary with the
// systemd version and the span: "14min left" or a bare "14min", "1h 47min", "4 days", "2 days ago".
// So nothing is counted: NEXT is read first, the LEFT words are skipped up to the next stamp or
// marker, and LAST is whatever stamp or marker follows. systemd prints LEFT as a marker exactly
// when NEXT is one (the service is running, or the timer has no next run), so a marker right after
// an empty NEXT is LEFT and is stepped over before LAST is read.
export function parseTimerRow(line: string): { name: string; next: string | null; last: string | null } {
  const cols = line.trim().split(/\s+/);
  const timerIndex = cols.findIndex((c) => c.endsWith(".timer"));
  const name = timerIndex >= 0 ? cols[timerIndex] : cols[cols.length - 2];
  const limit = timerIndex >= 0 ? timerIndex : cols.length;

  const isMarker = (i: number) => cols[i] === "-" || cols[i] === "n/a";
  const isStampStart = (i: number) => i + 3 < limit && /^\d{4}-\d{2}-\d{2}$/.test(cols[i + 1]);
  const stampAt = (i: number) => cols.slice(i, i + 4).join(" ");

  let i = 0;
  let next: string | null = null;
  if (i < limit && isMarker(i)) {
    i += 1;
    if (i < limit && isMarker(i)) i += 1; // the LEFT marker paired with an empty NEXT
  } else if (isStampStart(i)) {
    next = stampAt(i);
    i += 4;
  } else {
    i += 1;
  }

  while (i < limit && !isMarker(i) && !isStampStart(i)) i += 1; // the LEFT duration, whatever its shape

  const last = i < limit && isStampStart(i) ? stampAt(i) : null;
  return { name, next, last };
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

  // df prints one line per path given to it, but two paths on the same filesystem share a mount, so
  // "df -P / /var/backups" prints that mount twice when both live on the root filesystem. Keep the
  // first row for each mount name so the report never lists a mount more than once.
  const diskRows = (df ?? "")
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((cols) => cols.length >= 6)
    .map((cols) => ({ mount: cols[5], freePercent: pct(Number(cols[3]), Number(cols[1])) }));
  const seenMounts = new Set<string>();
  const disk = diskRows.filter((row) => {
    if (seenMounts.has(row.mount)) return false;
    seenMounts.add(row.mount);
    return true;
  });

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
