import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getAllPlayers } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 300;

export default async function PlayersIndexPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const players = await getAllPlayers(league);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{LEAGUE_LABEL[league]} Players</h1>
      <AdSlot label="Players index top" />
      {players.length === 0 ? (
        <p className="text-sm text-neutral-500">No player stats recorded yet — check back after games are played.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {players.map((p) => (
            <li key={p.espn_id}>
              <Link href={`/${league}/players/${p.slug}`} className="hover:underline">
                {p.name}
              </Link>
              {p.team_name && <span className="text-neutral-400"> · {p.team_name}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
