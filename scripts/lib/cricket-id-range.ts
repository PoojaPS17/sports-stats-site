// Argument parsing and the skip rule for import-cricket-espn.ts's id-range mode
// (`--ids 62387-63862`): load a block of ESPN event ids one by one, oldest first, without
// the daily header-feed discovery. Pure, so a test can pin both without a database.
import type { IntlLeague } from "../import-cricket-espn";

// Same list as INTL_LEAGUES there (that module opens the database pool on import, so it is not imported for values).
const LEAGUES: IntlLeague[] = ["test", "odi", "t20i", "wodi", "wt20i"];

export interface IdRangeArgs {
  from: number;
  to: number;
  league: IntlLeague;
  force: boolean;
  dryRun: boolean;
  workers: number;
  delayMs: number;
  attempts: number;
}

export const ID_MODE_DEFAULTS = { workers: 2, delayMs: 400, attempts: 8, league: "test" as IntlLeague };

/** "62387-63862" or a single id "62396"; null when it is neither (or the range runs backwards). */
export function parseIdRange(text: string | undefined): { from: number; to: number } | null {
  const m = String(text ?? "").match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] === undefined ? from : Number(m[2]);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 1 && to >= from ? { from, to } : null;
}

const VALUE_FLAGS = ["ids", "league", "workers", "delay", "attempts"];
const BOOL_FLAGS = ["force", "dry-run"];

/** Parses the id-mode flags, or says what is wrong. Returns null when `--ids` is not present (the other modes). */
export function parseIdModeArgs(argv: string[]): IdRangeArgs | { error: string } | null {
  if (!argv.includes("--ids")) return null;
  const opts = new Map<string, string>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) return { error: `unexpected argument ${a}` };
    const name = a.slice(2);
    if (BOOL_FLAGS.includes(name)) bools.add(name);
    else if (VALUE_FLAGS.includes(name)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) return { error: `--${name} needs a value` };
      opts.set(name, v);
      i++;
    } else return { error: `unknown flag ${a}` };
  }
  const range = parseIdRange(opts.get("ids"));
  if (!range) return { error: `--ids must be an id or a range like 62387-63862, got "${opts.get("ids")}"` };
  const league = (opts.get("league") ?? ID_MODE_DEFAULTS.league) as IntlLeague;
  if (!LEAGUES.includes(league)) return { error: `--league must be one of ${LEAGUES.join(", ")}` };
  const int = (name: string, fallback: number, min: number): number | { error: string } => {
    const raw = opts.get(name);
    if (raw === undefined) return fallback;
    const n = Number(raw);
    return Number.isInteger(n) && n >= min ? n : { error: `--${name} must be an integer of at least ${min}` };
  };
  const workers = int("workers", ID_MODE_DEFAULTS.workers, 1);
  const delayMs = int("delay", ID_MODE_DEFAULTS.delayMs, 0);
  const attempts = int("attempts", ID_MODE_DEFAULTS.attempts, 1);
  for (const v of [workers, delayMs, attempts]) if (typeof v === "object") return v;
  return { ...range, league, force: bools.has("force"), dryRun: bools.has("dry-run"), workers: workers as number, delayMs: delayMs as number, attempts: attempts as number };
}

/** The ids of from..to still to fetch, ascending (oldest first): stored ones are skipped unless `force`. */
export function idsToFetch(from: number, to: number, stored: Iterable<string>, force: boolean): string[] {
  const have = new Set(stored);
  const out: string[] = [];
  for (let id = from; id <= to; id++) if (force || !have.has(String(id))) out.push(String(id));
  return out;
}

/** Retries per path after the first attempt, for `attempts` total tries on each path: 8 attempts → 7 retries. */
export function retriesForAttempts(attempts: number): number {
  return Math.max(0, attempts - 1);
}
