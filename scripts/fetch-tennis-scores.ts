// Recent/current tennis results — singles only for v1 (doubles adds a second player
// per side, which the player1/player2 schema here doesn't model). Unlike the team
// sports' scoreboard, tennis's doesn't support a `dates=` filter at all (any date
// param, including today's, returns zero events) — the bare, unparameterized call is
// the only one that works, and it returns whichever tournament(s) are currently on.
import { pool } from "./lib/db";
import { fetchTennisScoreboard, type Tour } from "./lib/tennis";
import { uniqueSlugFor } from "./lib/players";

const TOURS: Tour[] = ["atp", "wta"];

// Grand Slam scoreboards (US Open etc.) are jointly programmed — ESPN returns both the
// men's and women's draws under the *same* event regardless of whether you hit the
// tennis/atp or tennis/wta path. Without pinning each tour to its own grouping slug,
// fetching "atp" also pulls in every women's-singles match (and vice versa).
const TOUR_GROUPING_SLUG: Record<Tour, string> = {
  atp: "mens-singles",
  wta: "womens-singles",
};

// ESPN represents an undetermined future bracket slot as a fake "TBD" competitor,
// same idea as the "TBA" placeholder teams seen in cricket brackets. Matches with
// a TBD side aren't a real pairing yet, so they're skipped rather than shown.
function isPlaceholderPlayer(name: string): boolean {
  return name.trim().toUpperCase() === "TBD";
}

// The scoreboard's per-match athlete object (unlike the rankings' dereferenced
// athlete resource) has no `id` field of its own — the athlete id is the *competitor*
// wrapper's id instead, so it's passed in separately here.
async function upsertPlayer(tour: Tour, athleteId: string, athlete: any) {
  const name = athlete?.displayName ?? athlete?.fullName;
  if (!athleteId || !name || isPlaceholderPlayer(name)) return;
  // Two different players can share a plain slugify(name) (e.g. two "Maria Sanchez"s
  // on tour) — uniqueSlugFor disambiguates by appending the espn id when that happens,
  // same as every other player-upserting script does.
  const slug = await uniqueSlugFor(tour, athleteId, name);
  await pool.query(
    `insert into players (league, espn_id, name, slug, headshot_url)
     values ($1, $2, $3, $4, $5)
     on conflict (league, espn_id) do update set name = excluded.name`,
    [tour, athleteId, name, slug, athlete.headshot?.href ?? null]
  );
}

async function processTour(tour: Tour) {
  let matchCount = 0;

  try {
    const data = await fetchTennisScoreboard(tour);
    for (const ev of data.events ?? []) {
      for (const grouping of ev.groupings ?? []) {
        if (grouping.grouping?.slug !== TOUR_GROUPING_SLUG[tour]) continue;
        for (const comp of grouping.competitions ?? []) {
          const p1 = comp.competitors?.find((c: any) => c.homeAway === "home");
          const p2 = comp.competitors?.find((c: any) => c.homeAway === "away");
          if (!p1?.id || !p2?.id || !p1.athlete || !p2.athlete) continue;
          const p1Name = p1.athlete.displayName ?? p1.athlete.fullName ?? "";
          const p2Name = p2.athlete.displayName ?? p2.athlete.fullName ?? "";
          if (isPlaceholderPlayer(p1Name) || isPlaceholderPlayer(p2Name)) continue;

          await upsertPlayer(tour, p1.id, p1.athlete);
          await upsertPlayer(tour, p2.id, p2.athlete);

          const winnerId = p1.winner ? p1.id : p2.winner ? p2.id : null;
          const scoreDisplay = comp.notes?.find((n: any) => n.type === "event")?.text ?? null;
          const status = comp.status;

          await pool.query(
            `insert into tennis_matches (
               tour, espn_id, tournament_name, round, date,
               player1_espn_id, player2_espn_id, score_display, winner_espn_id,
               completed, status_state, status_detail, updated_at
             ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
             on conflict (tour, espn_id) do update set
               score_display = excluded.score_display, winner_espn_id = excluded.winner_espn_id,
               completed = excluded.completed, status_state = excluded.status_state,
               status_detail = excluded.status_detail, updated_at = now()`,
            [
              tour,
              comp.id,
              ev.name,
              grouping.grouping?.displayName ?? null,
              comp.date,
              p1.id,
              p2.id,
              scoreDisplay,
              winnerId,
              Boolean(status?.type?.completed),
              status?.type?.state ?? null,
              status?.type?.detail ?? null,
            ]
          );
          matchCount++;
        }
      }
    }
  } catch (err) {
    console.error(`[fetch-tennis-scores] ${tour} failed:`, err instanceof Error ? err.message : err);
  }
  console.log(`[fetch-tennis-scores] ${tour}: upserted ${matchCount} matches`);
}

async function main() {
  for (const tour of TOURS) {
    try {
      await processTour(tour);
    } catch (err) {
      console.error(`[fetch-tennis-scores] ${tour} failed:`, err instanceof Error ? err.message : err);
    }
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[fetch-tennis-scores] failed:", err);
  process.exit(1);
});
