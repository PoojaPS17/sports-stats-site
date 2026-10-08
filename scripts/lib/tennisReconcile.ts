// Finish tennis matches that ESPN's daily listing left "pre" for good.
//
// The daily listing (scripts/fetch-tennis-daily.ts) is a window around each Eastern day. A match played in the early
// hours of that day (the Shanghai qualifying round on 2026-10-05 started 00:10 Eastern, 04:10 UTC) can fall in the gap
// between two days' windows: the listing carried it only as a "M/d - TBD" placeholder before play and never again after
// it, so the row stayed "Time TBD" with no result while ESPN's per-match resource (core API) had the final score.
// Production 2026-10-08: 24 qualifiers (Shanghai 12, Hangzhou 6, Chengdu 6) in that state, all with a result on ESPN.
//
// This reads such a row's own competition resource and stores the result, changing only what the resource states:
// the start time, status, winner, score and the sets. It never touches a match the resource still calls scheduled,
// cancelled or postponed (those are shown as such), never invents a winner, and skips a row whose competitors it
// cannot match to the row's two players.
import type { Pool } from "pg";
import { isCalledOff } from "../../src/lib/gameStatus";
import type { Tour } from "./tennis";

type Db = Pick<Pool, "query">;

export interface CoreSet {
  games: number;
  tiebreak: number | null;
  winner: boolean;
}

export interface CoreResult {
  /** ESPN's start time (ISO), when it gave one. */
  date: string | null;
  state: string;
  completed: boolean;
  detail: string | null;
  /** The winner's ESPN id (first id of the side), null when ESPN names none. */
  winnerId: string | null;
  /** Sets by competitor id (first id of the side). */
  sets: Record<string, CoreSet[]>;
  /** True when the resource says the slot is a bye, not a match. */
  bye: boolean;
}

/** What the fetchers return: the competition resource, its status and each competitor's linescores. */
export interface CoreCompetition {
  competition: any;
  status: any;
  linescores: Record<string, any>;
}

const firstId = (id: unknown): string => String(id ?? "").split("-")[0];

/**
 * A set is decided when it reached the usual end: six games with a two-game lead, seven with the opponent on five or six
 * (tie-break), or a match tie-break played as a set ("1-0" with points). An interrupted set (retired at 5-2) is not.
 */
function setDecidedFor(own: number, other: number, ownTiebreak: number | null, otherTiebreak: number | null): boolean {
  if (own <= other) return false;
  if ((ownTiebreak != null || otherTiebreak != null) && own <= 1) return true;
  return (own >= 6 && own - other >= 2) || (own === 7 && other >= 5);
}

/** The result a competition resource states, or null when it does not name two competitors. */
export function parseCoreCompetition(core: CoreCompetition): CoreResult | null {
  const competitors: any[] = core.competition?.competitors ?? [];
  if (competitors.length !== 2) return null;
  const type = core.status?.type ?? {};
  const state: string = type.state ?? "pre";
  const detail: string | null = typeof type.detail === "string" ? type.detail : null;
  const bye = /^STATUS_BYE$/i.test(String(type.name ?? "")) || /^bye$/i.test(detail ?? "");

  const raw: Record<string, { games: number; tiebreak: number | null }[]> = {};
  for (const c of competitors) {
    const items: any[] = core.linescores?.[String(c.id)]?.items ?? [];
    raw[firstId(c.id)] = items
      .filter((l) => typeof l.value === "number")
      .sort((a, b) => (a.period ?? 0) - (b.period ?? 0))
      .map((l) => ({ games: l.value as number, tiebreak: typeof l.tiebreak === "number" ? l.tiebreak : null }));
  }
  const [a, b] = competitors.map((c) => firstId(c.id));
  const n = Math.max(raw[a]?.length ?? 0, raw[b]?.length ?? 0);
  const sets: Record<string, CoreSet[]> = { [a]: [], [b]: [] };
  for (let i = 0; i < n; i++) {
    const x = raw[a]?.[i];
    const y = raw[b]?.[i];
    if (!x || !y) continue;
    // A set that was never played (a retirement is recorded as "6-4 0-0 ret") is not a set.
    if (x.games === 0 && y.games === 0 && x.tiebreak == null && y.tiebreak == null) continue;
    sets[a].push({ games: x.games, tiebreak: x.tiebreak, winner: setDecidedFor(x.games, y.games, x.tiebreak, y.tiebreak) });
    sets[b].push({ games: y.games, tiebreak: y.tiebreak, winner: setDecidedFor(y.games, x.games, y.tiebreak, x.tiebreak) });
  }
  const winner = competitors.filter((c) => c.winner === true);
  return {
    date: typeof core.competition?.date === "string" ? core.competition.date : null,
    state,
    completed: type.completed === true,
    detail,
    winnerId: winner.length === 1 ? firstId(winner[0].id) : null,
    sets,
    bye,
  };
}

/** "7-6(7-5) 5-7 6-4": one side's games per set, the tie-break points of both players when the feed gives them. */
export function scoreText(own: CoreSet[], other: CoreSet[]): string | null {
  if (own.length === 0) return null;
  return own
    .map((s, i) => {
      const o = other[i];
      const tb = s.tiebreak != null || o?.tiebreak != null ? `(${[s.tiebreak, o?.tiebreak].filter((v) => v != null).join("-")})` : "";
      return `${s.games}-${o?.games ?? 0}${tb}`;
    })
    .join(" ");
}

const sideJson = (side: any, sets: CoreSet[], score: string | null) => ({ ...side, sets, score });

/**
 * Stores the result of every stale row the resources can finish: pre, not completed, started at least `minAgeHours` ago
 * and within `maxAgeDays`, newest first, at most `limit` per run. Returns how many rows were completed and how many
 * were looked at.
 */
export async function reconcileStaleMatches(
  db: Db,
  fetchCompetition: (tour: Tour, tournamentId: string, competitionId: string) => Promise<CoreCompetition>,
  opts: { limit?: number; minAgeHours?: number; maxAgeDays?: number; log?: (msg: string) => void } = {}
): Promise<{ looked: number; completed: number; byes: number }> {
  const { limit = 60, minAgeHours = 12, maxAgeDays = 45, log = () => {} } = opts;
  const { rows } = await db.query(
    `select tour, espn_id, tournament_espn_id, player1_espn_id, player2_espn_id, side1, side2
     from tennis_matches
     where not completed and status_state = 'pre' and tournament_espn_id is not null and side1 is not null and side2 is not null
       and date < now() - ($1::int * interval '1 hour') and date > now() - ($2::int * interval '1 day')
     order by date desc limit $3`,
    [minAgeHours, maxAgeDays, limit]
  );
  let completed = 0;
  let byes = 0;
  for (const row of rows) {
    try {
      const core = await fetchCompetition(row.tour as Tour, row.tournament_espn_id, row.espn_id);
      const r = parseCoreCompetition(core);
      if (!r) continue;
      if (r.bye) {
        // Not a match: kept out of every list by the reader (status "Bye").
        await db.query(`update tennis_matches set status_detail = 'Bye', updated_at = now() where tour = $1 and espn_id = $2 and not completed and status_state = 'pre'`, [row.tour, row.espn_id]);
        byes++;
        continue;
      }
      const ids = new Set(Object.keys(r.sets));
      if (!ids.has(row.player1_espn_id) || !ids.has(row.player2_espn_id)) {
        log(`match ${row.espn_id}: ESPN's competitors do not match the stored players, left as it is`);
        continue;
      }
      // Only a finished match is stored. Scheduled, cancelled, postponed and in-play ones are left to the daily listing.
      if (r.state !== "post" || !r.completed || isCalledOff(r.detail) || !r.winnerId) continue;
      const s1 = r.sets[row.player1_espn_id];
      const s2 = r.sets[row.player2_espn_id];
      const winnerSets = r.winnerId === row.player1_espn_id ? s1 : s2;
      const loserSets = r.winnerId === row.player1_espn_id ? s2 : s1;
      const res = await db.query(
        `update tennis_matches set
           date = coalesce($3::timestamptz, date), day = (coalesce($3::timestamptz, date) at time zone 'America/New_York')::date,
           completed = true, status_state = 'post', status_detail = $4, winner_espn_id = $5, score_display = $6,
           side1 = $7::jsonb, side2 = $8::jsonb, updated_at = now()
         where tour = $1 and espn_id = $2 and not completed and status_state = 'pre'`,
        [
          row.tour,
          row.espn_id,
          r.date,
          r.detail ?? "Final",
          r.winnerId,
          scoreText(winnerSets, loserSets),
          JSON.stringify(sideJson(row.side1, s1, scoreText(s1, s2))),
          JSON.stringify(sideJson(row.side2, s2, scoreText(s2, s1))),
        ]
      );
      completed += res.rowCount ?? 0;
    } catch (err) {
      log(`match ${row.espn_id} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { looked: rows.length, completed, byes };
}
