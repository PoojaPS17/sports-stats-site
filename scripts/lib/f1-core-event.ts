// Saving a race weekend's results from ESPN's core API event resource (sports.core.api.espn.com .../events/<id>), which is where
// the facts the site shows beside a position live: each competitor carries his team (`vehicle.manufacturer`) and car number inline,
// and his status and laps completed behind two refs. The site.api scoreboard (scripts/fetch-f1-scores.ts) carries none of them, so
// a weekend saved only from the scoreboard has positions and nothing else: no team, no Ret / DSQ labels, no laps. Used by the
// one-time history backfill (scripts/backfill-f1-events.ts) and by the daily refresh of recent weekends (f1-refresh.ts).
import type { Pool } from "pg";
import { uniqueSlugFor } from "./players";
import { addF1DidNotStartRows, f1CompetitorDetail, f1SessionHasStatuses, isPracticeOnlyCompetitor, loadKnownF1Details, saveF1CompetitorResult, type FetchRef } from "./f1-competitor";

export interface CoreSessionDeps {
  fetchRef: FetchRef;
  /** A driver's name from his athlete ref (cached by the caller); null when ESPN has none. */
  resolveName: (ref: string, id: string) => Promise<string | null>;
  /** A status or laps request that failed: that driver keeps what is stored. */
  onLookupFailure: (ref: string, err: unknown) => void;
}

async function upsertDriver(pool: Pool, id: string, name: string) {
  const slug = await uniqueSlugFor("f1", id, name);
  await pool.query(
    `insert into players (league, espn_id, name, slug) values ('f1', $1, $2, $3)
     on conflict (league, espn_id) do update set name = excluded.name`,
    [id, name, slug]
  );
}

/**
 * Save the drivers of one session of a core event resource. A driver stored with his final status and laps is not asked about again
 * (f1CompetitorDetail's `known`), so running this again is cheap and changes nothing. A team, car number, status or laps the feed
 * does not give keeps the stored value (saveF1CompetitorResult), so a thin read never blanks a thick one.
 */
export async function saveCoreSessionResults(pool: Pool, eventId: string, comp: any, deps: CoreSessionDeps): Promise<number> {
  const sessionType: string | undefined = comp.type?.abbreviation;
  const known = f1SessionHasStatuses(sessionType) ? await loadKnownF1Details(pool, comp.id) : undefined;
  let results = 0;
  for (const c of comp.competitors ?? []) {
    const athleteRef = c.athlete?.["$ref"];
    if (!c.id || !athleteRef) continue;
    if (f1SessionHasStatuses(sessionType) && isPracticeOnlyCompetitor(c)) {
      await saveF1CompetitorResult(pool, comp.id, sessionType, c, { status: null, laps: null }); // removes a stored practice-only row
      continue;
    }
    const name = await deps.resolveName(athleteRef, c.id);
    if (!name) continue;
    await upsertDriver(pool, c.id, name);
    const detail = f1SessionHasStatuses(sessionType) ? await f1CompetitorDetail(c, deps.fetchRef, known?.get(c.id), deps.onLookupFailure) : { status: null, laps: null };
    if (await saveF1CompetitorResult(pool, comp.id, sessionType, c, detail)) results++;
  }
  if (sessionType === "Race") await addF1DidNotStartRows(pool, eventId, comp.id);
  return results;
}
