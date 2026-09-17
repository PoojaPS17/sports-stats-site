import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getRecentAndUpcoming, getMostRecentPlayedSeason, formatSeasonLabel } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";

export const revalidate = 60;

function groupByDay(games: Awaited<ReturnType<typeof getRecentAndUpcoming>>) {
  const groups = new Map<string, typeof games>();
  for (const g of games) {
    const key = new Date(g.date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }
  return groups;
}

export default async function LeaguePage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const games = await getRecentAndUpcoming(league, 2, 7);
  const groups = groupByDay(games);
  // This page is a rolling recent-and-upcoming window, not a live-only view — for a
  // seasonal competition (NBA preseason, IPL/BBL between tournaments) that window can
  // be genuinely empty for months at a time. Rather than a bare "nothing here" that
  // reads like a bug, point at the most recent season's actual results.
  const mostRecentSeason = groups.size === 0 ? await getMostRecentPlayedSeason(league) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} Scores</h1>

      <AdSlot label={`${LEAGUE_LABEL[league]} top`} />

      {groups.size === 0 && (
        <div className="card px-4 py-6 text-sm text-[var(--text-muted)]">
          <p>
            No {LEAGUE_LABEL[league]} games in the last 2 days or next 7 — the competition may be between seasons right
            now.
          </p>
          {mostRecentSeason !== null && mostRecentSeason !== undefined && (
            <p className="mt-2">
              <Link href={`/${league}/standings/${mostRecentSeason}`} className="font-semibold text-[var(--accent)] hover:underline">
                See the {formatSeasonLabel(league, mostRecentSeason)} standings →
              </Link>
            </p>
          )}
        </div>
      )}

      {[...groups.entries()].map(([day, dayGames]) => (
        <section key={day}>
          <SectionHeader>{day}</SectionHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dayGames.map((g) => (
              <GameCard key={g.espn_id} league={league} game={g} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
