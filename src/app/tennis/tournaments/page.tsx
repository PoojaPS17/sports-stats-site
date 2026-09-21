import type { Metadata } from "next";
import { pageMeta } from "@/lib/metadata";
import { TournamentCalendar } from "@/components/TennisCalendar";
import { getTennisTournamentSeasons, getTennisTournaments } from "@/lib/tennis";

// Champions land as draws finish, and the "In play" badge is computed from today's date.
export const revalidate = 300;

export const metadata: Metadata = pageMeta("Tennis Calendar", "The ATP and WTA season calendar: every tournament with dates, venue and champions, month by month.", "/tennis/tournaments");

export default async function TennisTournamentsPage() {
  const seasons = await getTennisTournamentSeasons();
  const season = seasons[0] ?? new Date().getUTCFullYear();
  const tournaments = await getTennisTournaments(season);
  return <TournamentCalendar season={season} seasons={seasons} tournaments={tournaments} />;
}
