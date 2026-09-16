import { pool } from "./db";
import { fetchCoreTeam, fetchByRef, type League } from "./espn";

// Fetches venue + current head coach for one team and stores it on the `teams` row.
// Not available for IPL (cricket's team-level core-API endpoints 404 for this
// competition, same limitation as the site API's /teams/{id} and /roster).
export async function upsertTeamInfo(league: League, teamEspnId: string, season: number): Promise<boolean> {
  if (league === "ipl") return false;

  const team = await fetchCoreTeam(league, teamEspnId, season);
  const venue = team.venue;

  // Soccer's season-scoped coach lookup 500s, and the team's own (non-season-scoped)
  // `coaches` ref returns a single stale historical entry instead of the current
  // manager (verified: Arsenal's returns Arsène Wenger, who left in 2018) — showing
  // that would be actively wrong, so skip coach entirely for this league rather than
  // publish an unverified name. NBA/NFL's season-scoped coach lookup is confirmed
  // accurate (spot-checked against known current coaches).
  let coachName: string | null = null;
  try {
    const coachesRef = league !== "epl" ? team.coaches?.["$ref"] : undefined;
    if (coachesRef) {
      const coachesList = await fetchByRef<{ items?: { $ref: string }[] }>(coachesRef);
      const firstCoachRef = coachesList.items?.[0]?.["$ref"];
      if (firstCoachRef) {
        const coach = await fetchByRef<{ firstName?: string; lastName?: string }>(firstCoachRef);
        if (coach.firstName || coach.lastName) coachName = [coach.firstName, coach.lastName].filter(Boolean).join(" ");
      }
    }
  } catch {
    // A team between head coaches (fired/vacant) shouldn't block the venue update.
  }

  await pool.query(
    `update teams set
       venue_name = $3, venue_city = $4, venue_state = $5, venue_country = $6, head_coach = $7
     where league = $1 and espn_id = $2`,
    [
      league,
      teamEspnId,
      venue?.fullName ?? null,
      venue?.address?.city ?? null,
      venue?.address?.state ?? null,
      venue?.address?.country ?? null,
      coachName,
    ]
  );
  return true;
}
