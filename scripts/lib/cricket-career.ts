// Bumped when the extraction below changes what it stores, so refresh-cricket-cards.ts
// can find the rows written by an older version. 2: catches no longer double-counted,
// per-innings figures for Tests, unrecorded balls and boundaries stored as null.
// 3: a player in the XI who did nothing is stored too (a card with no figures), so
// Matches counts every appearance.
export const CARD_VERSION = 3;

export interface CricketBatting {
  runs: number;
  /** Null when the scorecard does not record balls faced (most matches before the 1990s). */
  ballsFaced: number | null;
  /** Null when the scorecard does not record boundaries. */
  fours: number | null;
  sixes: number | null;
  notOut: boolean;
}
export interface CricketBowling {
  overs: number;
  conceded: number;
  wickets: number;
  /** Balls per over, when not six (Tests in Australia and elsewhere used eight-ball overs until 1979). */
  bpo?: number;
}

export interface CricketPlayerMatchStats {
  athleteId: string;
  name: string;
  teamId: string;
  /** Match totals. In a two-innings match `notOut` is true only if never dismissed. */
  batting?: CricketBatting;
  bowling?: CricketBowling;
  catches?: number;
  /**
   * One entry per match innings the player batted or bowled in, for first-class
   * matches only (a Test has two innings a side). Averages, high scores, hundreds
   * and five-wicket hauls are per innings, so they read this when it is present and
   * the match totals above when it is not (every limited-overs match).
   */
  innings?: { n: number; batting?: CricketBatting; bowling?: CricketBowling }[];
}

// Overs are written "12.3" (12 overs and 3 balls), so they cannot be summed as decimals.
function addOvers(a: number, b: number, ballsPerOver: number): number {
  const balls = (x: number) => Math.floor(x) * ballsPerOver + Math.round((x - Math.floor(x)) * 10);
  const total = balls(a) + balls(b);
  return Number(`${Math.floor(total / ballsPerOver)}.${total % ballsPerOver}`);
}

// Cricket has no boxscore/rosters-with-flat-stats shape like the other sports — each
// player's contribution lives inside rosters[].roster[].linescores[], one entry per
// innings, with the underlying stat set differing depending on whether that entry
// represents batting, bowling, or pure fielding. Mirrors the per-match parsing in
// src/lib/matchDetail.ts (that file can't be imported from scripts/, so this is a
// small parallel copy), but accumulates one row per player instead of display tables.
export function extractCricketMatchStats(summary: any): { venue: string | null; players: CricketPlayerMatchStats[] } {
  const venue = summary?.gameInfo?.venue?.fullName ?? null;
  const players: CricketPlayerMatchStats[] = [];
  // In the XI (or came on) but no batting, bowling or catch: still a match played.
  const appearances: CricketPlayerMatchStats[] = [];

  const statsOf = (period: any): any[] => period?.statistics?.categories?.[0]?.stats ?? [];
  const read = (stats: any[], statName: string): number => {
    const found = stats.find((s) => s.name === statName);
    const n = Number(found?.value ?? found?.displayValue);
    return Number.isFinite(n) ? n : 0;
  };

  // Older scorecards carry runs but no balls faced or boundary counts. Those read as
  // zeros in the feed; an innings where nobody faced a ball (or a sizeable total was
  // made without a boundary) is one the scorers did not record, not a true zero.
  const recorded = new Map<string, { balls: number; boundaries: number; runs: number }>();
  // Two innings a side only in a Test or other first-class match; in a limited-overs
  // match a period past the second is a super over, which is not part of the card.
  const firstClass = /test|first-class/i.test(String(summary?.header?.competitions?.[0]?.class?.generalClassCard ?? ""));
  const counts = (period: any) => firstClass || !(Number(period?.period) > 2);
  for (const r of summary?.rosters ?? []) {
    for (const p of r.roster ?? []) {
      for (const period of p.linescores ?? []) {
        const stats = statsOf(period);
        if (stats.length === 0 || !counts(period) || !(read(stats, "batted") > 0 || read(stats, "ballsFaced") > 0)) continue;
        const key = `${r.team?.id}:${period.period}`;
        const t = recorded.get(key) ?? { balls: 0, boundaries: 0, runs: 0 };
        t.balls += read(stats, "ballsFaced");
        t.boundaries += read(stats, "fours") + read(stats, "sixes");
        t.runs += read(stats, "runs");
        recorded.set(key, t);
      }
    }
  }

  for (const r of summary?.rosters ?? []) {
    const teamId: string | undefined = r.team?.id;
    if (!teamId) continue;

    for (const p of r.roster ?? []) {
      const athleteId: string | undefined = p.athlete?.id;
      const name: string | undefined = p.athlete?.displayName;
      if (!athleteId || !name) continue;

      const innings: NonNullable<CricketPlayerMatchStats["innings"]> = [];
      let catches = 0;

      for (const period of p.linescores ?? []) {
        const stats = statsOf(period);
        if (stats.length === 0 || !counts(period)) continue;
        const get = (statName: string) => read(stats, statName);
        const entry: (typeof innings)[number] = { n: Number(period.period) || innings.length + 1 };

        const ballsFaced = get("ballsFaced");
        if (get("batted") > 0 || ballsFaced > 0) {
          const team = recorded.get(`${teamId}:${period.period}`);
          const ballsKnown = (team?.balls ?? 0) > 0;
          const boundariesKnown = (team?.boundaries ?? 0) > 0 || (team?.runs ?? 0) < 50;
          entry.batting = {
            runs: get("runs"),
            ballsFaced: ballsKnown ? ballsFaced : null,
            fours: boundariesKnown ? get("fours") : null,
            sixes: boundariesKnown ? get("sixes") : null,
            notOut: get("notouts") > 0,
          };
        }
        const overs = get("overs");
        const bpo = get("bpo") || 6;
        if (overs > 0) entry.bowling = { overs, conceded: get("conceded"), wickets: get("wickets"), ...(bpo !== 6 ? { bpo } : {}) };
        // `caught` is the feed's total of `caughtFielder` and `caughtKeeper`, not a third
        // kind of catch; stumpings are separate. Counts catches and stumpings together.
        catches += Math.max(get("caught"), get("caughtFielder") + get("caughtKeeper")) + get("stumped");
        if (entry.batting || entry.bowling) innings.push(entry);
      }

      const bats = innings.filter((i) => i.batting).map((i) => i.batting!);
      const bowls = innings.filter((i) => i.bowling).map((i) => i.bowling!);
      const sumOrNull = (values: (number | null)[]) => (values.some((v) => v === null) ? null : values.reduce<number>((a, v) => a + (v ?? 0), 0));
      const bpo = bowls[0]?.bpo ?? 6;
      const batting: CricketBatting | undefined =
        bats.length > 0
          ? { runs: bats.reduce((a, b) => a + b.runs, 0), ballsFaced: sumOrNull(bats.map((b) => b.ballsFaced)), fours: sumOrNull(bats.map((b) => b.fours)), sixes: sumOrNull(bats.map((b) => b.sixes)), notOut: bats.every((b) => b.notOut) }
          : undefined;
      const bowling: CricketBowling | undefined =
        bowls.length > 0
          ? { overs: bowls.reduce((a, b) => addOvers(a, b.overs, bpo), 0), conceded: bowls.reduce((a, b) => a + b.conceded, 0), wickets: bowls.reduce((a, b) => a + b.wickets, 0), ...(bpo !== 6 ? { bpo } : {}) }
          : undefined;

      if (batting || bowling || catches > 0) {
        players.push({ athleteId, name, teamId, batting, bowling, catches: catches || undefined, innings: firstClass && innings.length > 0 ? innings : undefined });
      } else if (p.starter === true || p.subbedIn === true) {
        appearances.push({ athleteId, name, teamId });
      }
    }
  }

  // A match with no figures at all was abandoned before a ball was bowled: nobody played in it.
  if (players.length > 0) players.push(...appearances);

  return { venue, players };
}
