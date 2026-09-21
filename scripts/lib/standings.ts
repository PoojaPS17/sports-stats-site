import { pool } from "./db";
import type { League } from "./espn";

function statValue(stats: any[], ...names: string[]): string | undefined {
  for (const name of names) {
    const found = stats.find((s) => s.name === name)?.displayValue;
    if (found !== undefined) return found;
  }
  return undefined;
}

// The feed's cup group names vary by season ("GROUP A", "UEFA Champions League -
// Group A", "Group A"); keep just the group.
function tidyConference(name: string | null): string | null {
  if (!name) return null;
  const m = /(?:^|[\s-])group\s+([a-z])$/i.exec(name);
  return m ? `Group ${m[1].toUpperCase()}` : name;
}

// ESPN's own position in the table. Only a real position (1, 2, 3, ...) is kept: a missing stat, a
// dash or a 0 means the feed has no rank for the row, and the site then falls back to its own keys.
export function espnRank(value: string | undefined): number | null {
  const n = Math.round(Number(value));
  return value !== undefined && Number.isFinite(n) && n >= 1 ? n : null;
}

// A cricket table marks the teams through to the next stage with a `qualified` stat ("Y"). Only the
// qualifiers carry it, so a missing stat is "not known", not "no"; an explicit "N" is stored as false.
export function espnQualified(value: string | undefined): boolean | null {
  const v = value?.trim().toUpperCase();
  return v === "Y" ? true : v === "N" ? false : null;
}

function collectEntries(node: any, conference: string | null, out: any[]) {
  if (node.standings?.entries) {
    // A group nested under a conference that is not itself a conference is a
    // division (NFL "AFC East"); entries directly on the conference have none.
    const division = conference && !node.isConference && node.name ? node.name : null;
    for (const entry of node.standings.entries) {
      out.push({ entry, conference: tidyConference(conference ?? node.name ?? null), division });
    }
  }
  for (const child of node.children ?? []) {
    collectEntries(child, node.isConference ? node.name : conference, out);
  }
}

// Shared by the recurring current-season fetch and the one-time historical backfill —
// both just point this at a different ESPN standings response. A team keeps one row
// per stage table it appears in (a T20 World Cup side has a group row and a Super
// Eights row), so the unique key includes the conference.
export async function upsertStandingsResponse(league: League, data: any, seasonOverride?: number): Promise<number> {
  const season = seasonOverride ?? data.season?.year ?? new Date().getFullYear();
  const entries: any[] = [];
  collectEntries(data, null, entries);

  for (const { entry, conference, division } of entries) {
    const stats = entry.stats ?? [];
    // Football and the NFL send `ties`; a cricket table sends `matchesTied` (never both).
    const draws = statValue(stats, "ties", "matchesTied");
    const points = statValue(stats, "points", "matchPoints");
    const goalsFor = statValue(stats, "pointsFor");
    const goalsAgainst = statValue(stats, "pointsAgainst");
    const noResult = statValue(stats, "noresult");
    const netRunRate = statValue(stats, "netrr");
    const rank = espnRank(statValue(stats, "rank"));
    const qualified = espnQualified(statValue(stats, "qualified"));
    await pool.query(
      `insert into standings (
         league, season, team_espn_id, conference, wins, losses,
         win_percent, streak, playoff_seed, games_behind,
         draws, points, goals_for, goals_against, no_result, net_run_rate, division, rank,
         qualified, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         $19, now())
       on conflict (league, season, team_espn_id, coalesce(conference, '')) do update set
         division = coalesce(excluded.division, standings.division),
         wins = excluded.wins, losses = excluded.losses,
         win_percent = excluded.win_percent, streak = excluded.streak,
         playoff_seed = excluded.playoff_seed, games_behind = excluded.games_behind,
         draws = excluded.draws, points = excluded.points,
         goals_for = excluded.goals_for, goals_against = excluded.goals_against,
         no_result = excluded.no_result, net_run_rate = excluded.net_run_rate,
         rank = excluded.rank,
         qualified = excluded.qualified,
         updated_at = now()`,
      [
        league,
        season,
        entry.team.id,
        conference,
        Math.round(Number(statValue(stats, "wins", "matchesWon") ?? 0)),
        Math.round(Number(statValue(stats, "losses", "matchesLost") ?? 0)),
        Number(statValue(stats, "winPercent") ?? 0),
        statValue(stats, "streak") ?? null,
        statValue(stats, "playoffSeed") ? Math.round(Number(statValue(stats, "playoffSeed"))) : null,
        statValue(stats, "gamesBehind") ?? null,
        // These int-typed columns are only meaningful for soccer/cricket — but some
        // seasons (e.g. NBA's 2020 bubble restart) surface an unrelated "points" stat
        // under the same stat name, which can be a non-integer power-ranking value
        // rather than a real points column. Round defensively so a stray decimal from
        // an off-shape season never crashes the whole insert.
        draws !== undefined ? Math.round(Number(draws)) : null,
        points !== undefined ? Math.round(Number(points)) : null,
        goalsFor !== undefined ? Math.round(Number(goalsFor)) : null,
        goalsAgainst !== undefined ? Math.round(Number(goalsAgainst)) : null,
        noResult !== undefined ? Math.round(Number(noResult)) : null,
        netRunRate !== undefined ? Number(netRunRate) : null,
        division,
        rank,
        qualified,
      ]
    );
  }
  return entries.length;
}
