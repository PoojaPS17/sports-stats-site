import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getRecentAndUpcoming } from "@/lib/queries";
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} Scores</h1>

      <AdSlot label={`${LEAGUE_LABEL[league]} top`} />

      {groups.size === 0 && <p className="text-sm text-[var(--text-muted)]">No games in range.</p>}

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
