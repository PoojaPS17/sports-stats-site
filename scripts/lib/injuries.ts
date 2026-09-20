import type { Pool } from "pg";

/**
 * Replace a league's injury rows with ESPN's current list, in one transaction so a page render
 * never catches the table empty or half-written. A feed without an `injuries` array is treated
 * as a bad response (throw, keep what is stored); an empty array is ESPN saying "none" and clears the league.
 */
export async function replaceLeagueInjuries(pool: Pool, league: string, feed: unknown): Promise<{ teams: number; count: number }> {
  const teams = (feed as { injuries?: unknown } | null)?.injuries;
  if (!Array.isArray(teams)) {
    throw new Error(`injuries feed for ${league} is malformed (no injuries array) - keeping stored rows`);
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from injuries where league = $1", [league]);
    let count = 0;
    for (const team of teams) {
      const teamId = team.id;
      for (const injury of team.injuries ?? []) {
        const athlete = injury.athlete;
        if (!teamId || !athlete?.displayName || !injury.status) continue;
        await client.query(
          `insert into injuries (league, team_espn_id, player_espn_id, player_name, status, short_comment, long_comment, reported_date)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            league,
            teamId,
            // The injuries feed doesn't carry an athlete id directly on this object in
            // every case - fall back to a name-scoped synthetic id so a row is still
            // storable rather than silently dropped.
            injury.athlete?.id ?? `name:${athlete.displayName}`,
            athlete.displayName,
            injury.status,
            injury.shortComment ?? null,
            injury.longComment ?? null,
            injury.date ?? null,
          ]
        );
        count++;
      }
    }
    await client.query("commit");
    return { teams: teams.length, count };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
