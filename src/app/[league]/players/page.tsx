import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/metadata";
import { isLeague, LEAGUE_LABEL, getAllPlayers } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { PlayerIndexList } from "@/components/PlayerIndexList";
import { packPlayers } from "@/lib/playerIndex";

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} Players`, `All ${label} players with season stats and game logs.`, `/${league}/players`);
}

export const revalidate = 300;

export default async function PlayersIndexPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const players = await getAllPlayers(league);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">{LEAGUE_LABEL[league]} Players</h1>
      <AdSlot label="Players index top" />
      {players.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
          No player stats yet. They appear once the first games of the season are in.
        </p>
      ) : (
        <PlayerIndexList league={league} {...packPlayers(players)} />
      )}
    </div>
  );
}
