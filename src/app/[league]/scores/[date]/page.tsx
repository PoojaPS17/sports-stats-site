import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getGamesByDate } from "@/lib/queries";
import { GameRow } from "@/components/GameRow";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 60;

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
      <h1 className="text-2xl font-bold">
        {LEAGUE_LABEL[league]} Scores — {label}
      </h1>
      <AdSlot label="Scores-by-date top" />
      <div className="rounded border border-neutral-200 px-4 dark:border-neutral-800">
        {games.length === 0 ? (
          <p className="py-6 text-sm text-neutral-500">No games on this date.</p>
        ) : (
          games.map((g) => <GameRow key={g.espn_id} league={league} game={g} />)
        )}
      </div>
    </div>
  );
}
