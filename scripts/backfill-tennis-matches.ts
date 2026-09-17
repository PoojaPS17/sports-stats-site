// One-time historical backfill of Grand Slam results — fetch-tennis-scores.ts only
// ever sees "whatever tournament is currently on" (the scoreboard endpoint silently
// ignores any date filter, confirmed by testing), so it can never reach past events.
// The core API's per-tournament event resource has no such restriction: every
// ESPN-tracked competition is addressable directly by `{tournamentId}-{year}`.
//
// Scoped to the 4 majors rather than all ~230 ATP / ~360 WTA tournaments ESPN tracks
// — those also include a long tail of minor Challenger-level events, and covering all
// of them for 10 years would be an order of magnitude more requests for far less
// reader value than the majors, which is what most casual fans actually look up.
// Both tours share the same tournament ids for the majors (verified: id 189 is
// "U.S. Open" under both /leagues/atp/tournaments/189 and /leagues/wta/tournaments/189).
//
// Each (tour, major, year) is an independent read + independent writes, so they run
// with bounded concurrency instead of one at a time — a fully sequential first pass
// of this took ~7 minutes to clear a single tournament-year's worth of work.
import { pool } from "./lib/db";
import { fetchTournamentEventCompetitions, type Tour } from "./lib/tennis";
import { uniqueSlugFor } from "./lib/players";

const TOURS: Tour[] = ["atp", "wta"];
const YEARS_BACK = 10;
const CONCURRENCY = 8;

const MAJORS: { id: string; name: string }[] = [
  { id: "154", name: "Australian Open" },
  { id: "172", name: "French Open" },
  { id: "188", name: "Wimbledon Championships" },
  { id: "189", name: "US Open" },
];

// Competitions come back mixed with doubles/mixed-doubles draws; only the tour's own
// singles type is relevant here (matches the "singles only for v1" scope of the rest
// of the tennis feature).
const SINGLES_SLUG: Record<Tour, string> = { atp: "mens-singles", wta: "womens-singles" };

async function upsertPlayer(tour: Tour, athleteId: string, name: string) {
  if (!athleteId || !name) return;
  const slug = await uniqueSlugFor(tour, athleteId, name);
  await pool.query(
    `insert into players (league, espn_id, name, slug)
     values ($1, $2, $3, $4)
     on conflict (league, espn_id) do update set name = excluded.name`,
    [tour, athleteId, name, slug]
  );
}

async function backfillMajorYear(tour: Tour, major: { id: string; name: string }, year: number): Promise<number> {
  const data = await fetchTournamentEventCompetitions(tour, major.id, year);
  const singles = (data.items ?? []).filter((c: any) => c.type?.slug === SINGLES_SLUG[tour]);

  let count = 0;
  for (const m of singles) {
    const [p1, p2] = m.competitors ?? [];
    if (!p1?.id || !p2?.id || !p1.name || !p2.name || !m.date) continue;

    await upsertPlayer(tour, p1.id, p1.name);
    await upsertPlayer(tour, p2.id, p2.name);

    const winnerId = p1.winner ? p1.id : p2.winner ? p2.id : null;
    const scoreDisplay: string | null = m.notes?.[0]?.text ?? null;

    // Every event fetched here is a past Slam, so it's final by construction — no
    // separate status lookup needed (that field is a $ref requiring its own request
    // on this endpoint, unlike the live scoreboard where status comes embedded).
    await pool.query(
      `insert into tennis_matches (
         tour, espn_id, tournament_name, round, date,
         player1_espn_id, player2_espn_id, score_display, winner_espn_id,
         completed, status_state, status_detail, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'post','Final', now())
       on conflict (tour, espn_id) do update set
         score_display = excluded.score_display, winner_espn_id = excluded.winner_espn_id,
         completed = true, status_state = 'post', status_detail = 'Final', updated_at = now()`,
      [tour, m.id, major.name, m.type?.text ?? null, m.date, p1.id, p2.id, scoreDisplay, winnerId]
    );
    count++;
  }
  return count;
}

interface Job {
  tour: Tour;
  major: { id: string; name: string };
  year: number;
}

async function runPool(jobs: Job[], concurrency: number) {
  let index = 0;
  let done = 0;
  const grandTotals = new Map<string, number>();

  async function worker() {
    while (index < jobs.length) {
      const job = jobs[index++];
      try {
        const count = await backfillMajorYear(job.tour, job.major, job.year);
        const key = `${job.tour} ${job.major.name}`;
        grandTotals.set(key, (grandTotals.get(key) ?? 0) + count);
      } catch (err) {
        console.error(
          `[backfill-tennis-matches] ${job.tour} ${job.major.name} ${job.year} failed:`,
          err instanceof Error ? err.message : err
        );
      }
      done++;
      if (done % 10 === 0 || done === jobs.length) {
        console.log(`[backfill-tennis-matches] progress: ${done}/${jobs.length} tournament-years done`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return grandTotals;
}

async function main() {
  const currentYear = new Date().getUTCFullYear();
  const jobs: Job[] = [];
  for (const tour of TOURS) {
    for (const major of MAJORS) {
      for (let year = currentYear - YEARS_BACK; year <= currentYear; year++) {
        jobs.push({ tour, major, year });
      }
    }
  }
  console.log(`[backfill-tennis-matches] starting ${jobs.length} tournament-years across ${TOURS.length} tours...`);

  const totals = await runPool(jobs, CONCURRENCY);
  for (const [key, total] of totals) {
    console.log(`[backfill-tennis-matches] ${key}: ${total} singles matches across ${YEARS_BACK + 1} years`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[backfill-tennis-matches] failed:", err);
  process.exit(1);
});
