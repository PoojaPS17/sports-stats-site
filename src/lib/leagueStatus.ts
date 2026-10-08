// The rows of the /status table: per league, the newest result, the next fixture and the last week's results.
import { pool } from "./db";
import { CLASS_TO_LEAGUE } from "./cricketClasses";

export interface LeagueRow {
  league: string;
  newest_completed: Date | null;
  next_scheduled: Date | null;
  completed_7d: string;
}

/** Each international league's next fixture, from the earlier of the games table's and the series listing's. */
export function withCricketFixtures(leagues: LeagueRow[], fixtures: { class_id: string; next_scheduled: Date }[]): LeagueRow[] {
  const byLeague = new Map<string, Date>();
  for (const f of fixtures) {
    const lg = CLASS_TO_LEAGUE[f.class_id];
    const prev = byLeague.get(lg);
    if (lg && (!prev || f.next_scheduled < prev)) byLeague.set(lg, f.next_scheduled);
  }
  return leagues.map((l) => {
    const listed = byLeague.get(l.league);
    return listed && (!l.next_scheduled || listed < l.next_scheduled) ? { ...l, next_scheduled: listed } : l;
  });
}

export async function getLeagueStatusRows(): Promise<LeagueRow[]> {
  const [{ rows: leagues }, { rows: fixtures }] = await Promise.all([
    pool.query<LeagueRow>(
      `select league,
              max(date) filter (where completed) as newest_completed,
              min(date) filter (where not completed and date > now()) as next_scheduled,
              count(*) filter (where completed and date > now() - interval '7 days') as completed_7d
       from games group by league order by league`
    ),
    // An international gets a games row only once it is finished, so its future fixtures live in the series listing.
    // Not one that is already played, closed without play, or past its start (a match in play has begun).
    pool.query<{ class_id: string; next_scheduled: Date }>(
      `select m.international_class_id as class_id, min(m.date) as next_scheduled
       from cricket_series_matches m
       where m.status_state = 'pre' and m.date > now() and m.international_class_id = any($1::text[])
         and coalesce(m.status_summary, '') !~* '(postponed|cancelled|canceled|abandoned|called off)'
         and not exists (select 1 from games g where g.espn_id = m.espn_id and g.completed)
       group by 1`,
      [Object.keys(CLASS_TO_LEAGUE)]
    ),
  ]);
  return withCricketFixtures(leagues, fixtures);
}
