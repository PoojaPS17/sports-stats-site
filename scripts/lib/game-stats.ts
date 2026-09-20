// Per-game player box scores from ESPN's match summary, shared by the recurring
// scraper (recent games) and the historical backfill (every completed game).
import { pool } from "./db";
import type { League } from "./espn";
import { isSoccerLeague, slugify } from "./espn";
import { isPseudoAthleteId } from "../../src/lib/pseudoAthlete";

export type PlayerStats = Map<string, { athlete: any; teamId: string; stats: Record<string, Record<string, string>> }>;

// NBA/NFL: boxscore.players[team].statistics[category].athletes[].stats[] (parallel to category.labels[])
function extractAmericanSports(data: any): PlayerStats {
  const perPlayer: PlayerStats = new Map();
  for (const group of data.boxscore?.players ?? []) {
    const teamId: string = group.team.id;
    for (const category of group.statistics ?? []) {
      const labels: string[] = category.labels ?? [];
      // The NFL feed names each category (passing, rushing, ...); the NBA feed has a
      // single unnamed box score per team, stored under "box".
      const name: string = category.name ?? "box";
      for (const row of category.athletes ?? []) {
        // NBA: players who did not play still appear (with empty stats and a reason).
        if (row.didNotPlay || !row.stats?.length) continue;
        // Some box scores carry a name-only row (no athlete id, dashes for stats);
        // it cannot be stored as a player and would fail the whole game.
        if (!row.athlete?.id) continue;
        const key = row.athlete.id;
        if (!perPlayer.has(key)) perPlayer.set(key, { athlete: row.athlete, teamId, stats: {} });
        const values: Record<string, string> = {};
        labels.forEach((label, i) => {
          if (row.stats?.[i] !== undefined) values[label] = row.stats[i];
        });
        if (typeof row.starter === "boolean") values.GS = row.starter ? "1" : "0";
        perPlayer.get(key)!.stats[name] = values;
      }
    }
  }
  return perPlayer;
}

// Soccer: rosters[team].roster[].stats[] is a flat named list, not category/label pairs.
// Bundle it all under one "match" category so the display components (which expect
// { category: { label: value } }) work unchanged.
function extractSoccer(data: any): PlayerStats {
  const perPlayer: PlayerStats = new Map();
  for (const teamRoster of data.rosters ?? []) {
    const teamId: string = teamRoster.team.id;
    for (const item of teamRoster.roster ?? []) {
      if (!item.active) continue;
      if (!item.athlete?.id) continue;
      const values: Record<string, string> = {};
      for (const stat of item.stats ?? []) {
        values[stat.shortDisplayName ?? stat.name] = stat.displayValue;
      }
      perPlayer.set(item.athlete.id, {
        athlete: item.athlete,
        teamId,
        stats: { match: values },
      });
    }
  }
  return perPlayer;
}

export function extractPlayerStats(league: League, summary: any): PlayerStats {
  return isSoccerLeague(league) ? extractSoccer(summary) : extractAmericanSports(summary);
}

// ESPN lists a team-credited line ("Team", a negative athlete id such as -8801) in some NFL box-score tables. It stays
// in the box score below, as ESPN publishes it: the game page reads its rows from the match report itself, and
// consults `players` only to decide whether a line links to a player page, so nothing needs a players row for it.
// It is not a person, so no players row is created or updated for it, and no season totals are fetched for it.
// (The stat rows are keyed by the id alone, so a game's Team line is stored exactly as before.)
export function realAthletes(perPlayer: PlayerStats): PlayerStats {
  return new Map([...perPlayer].filter(([id]) => !isPseudoAthleteId(id)));
}

/** The players whose season totals are worth an ESPN athlete request after a game: player id -> team id, real athletes only. */
export function seasonStatTargets(perPlayer: PlayerStats): Map<string, string> {
  return new Map([...realAthletes(perPlayer)].map(([id, { teamId }]) => [id, teamId]));
}

// Writes the players (creating any we have never seen) and their stat rows for one
// game, in two batched statements rather than one round trip per player — the
// historical backfill touches tens of thousands of rows, and the database is remote.
// `updateTeam` should be true for live/recent games (a transfer shows up in the box
// score before the next roster fetch) and false for the backfill, where a game from
// 2017 must not overwrite a player's current club.
export async function storeGameStats(league: League, gameEspnId: string, perPlayer: PlayerStats, updateTeam: boolean): Promise<number> {
  if (perPlayer.size === 0) return 0;

  // Only real athletes become (or update) players; every box-score line, the Team line included, gets its stat row below.
  const people = realAthletes(perPlayer);
  const { rows: existing } = people.size
    ? await pool.query(`select espn_id from players where league = $1 and espn_id = any($2)`, [league, [...people.keys()]])
    : { rows: [] as { espn_id: string }[] };
  const known = new Set(existing.map((r) => r.espn_id as string));

  // New players need a unique slug each; existing ones keep theirs. Slug clashes are
  // checked in one query for the whole batch (a historical backfill meets dozens of
  // new players per game, and one round trip each was the bottleneck).
  const fresh = [...people].filter(([id]) => !known.has(id));
  const bases = new Map(fresh.map(([id, { athlete }]) => [id, slugify(athlete.displayName ?? athlete.fullName ?? `Player ${id}`)]));
  const { rows: taken } = fresh.length
    ? await pool.query(`select slug from players where league = $1 and slug = any($2)`, [league, [...new Set(bases.values())]])
    : { rows: [] as { slug: string }[] };
  const takenSlugs = new Set(taken.map((r) => r.slug as string));
  const usedNow = new Set<string>();
  const inserts: { id: string; teamId: string; name: string; slug: string; headshot: string | null; position: string | null; jersey: string | null }[] = [];
  for (const [id, { athlete, teamId }] of fresh) {
    const name = athlete.displayName ?? athlete.fullName ?? `Player ${id}`;
    const base = bases.get(id)!;
    const slug = takenSlugs.has(base) || usedNow.has(base) ? `${base}-${id}` : base;
    usedNow.add(slug);
    inserts.push({
      id,
      teamId,
      name,
      slug,
      headshot: athlete.headshot?.href ?? null,
      position: athlete.position?.abbreviation ?? null,
      jersey: athlete.jersey ?? null,
    });
  }
  if (inserts.length > 0) {
    const values: unknown[] = [];
    const tuples = inserts.map((p, i) => {
      values.push(league, p.id, p.teamId, p.name, p.slug, p.headshot, p.position, p.jersey);
      const b = i * 8;
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
    });
    await pool.query(
      `insert into players (league, espn_id, team_espn_id, name, slug, headshot_url, position, jersey)
       values ${tuples.join(",")}
       on conflict (league, espn_id) do nothing`,
      values
    );
  }
  if (updateTeam) {
    for (const [id, { athlete, teamId }] of people) {
      if (!known.has(id)) continue;
      await pool.query(
        `update players set team_espn_id = $3, name = $4, headshot_url = coalesce($5, headshot_url) where league = $1 and espn_id = $2`,
        [league, id, teamId, athlete.displayName ?? athlete.fullName, athlete.headshot?.href ?? null]
      );
    }
  }

  const values: unknown[] = [];
  const tuples = [...perPlayer].map(([id, { teamId, stats }], i) => {
    values.push(league, gameEspnId, id, teamId, JSON.stringify(stats));
    const b = i * 5;
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}, now())`;
  });
  await pool.query(
    `insert into player_game_stats (league, game_espn_id, player_espn_id, team_espn_id, stats, updated_at)
     values ${tuples.join(",")}
     on conflict (league, game_espn_id, player_espn_id) do update set
       team_espn_id = excluded.team_espn_id, stats = excluded.stats, updated_at = now()`,
    values
  );
  return perPlayer.size;
}
