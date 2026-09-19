import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getGamesByDate } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 15;

export default async function ScoresByDatePage({
  params,
}: {
  params: Promise<{ league: string; date: string }>;
}) {
  const { league, date } = await params;
  if (!isLeague(league) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const games = await getGamesByDate(league, date);
  const label = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">
        {LEAGUE_LABEL[league]} Scores — {label}
      </h1>
      <AdSlot label="Scores-by-date top" />
      {games.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No games on this date.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((g) => (
            <GameCard key={g.espn_id} league={league} game={g} />
          ))}
        </div>
      )}
    </div>
  );
}
