import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getAllPlayers } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 300;

export default async function PlayersIndexPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const players = await getAllPlayers(league);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} Players</h1>
      <AdSlot label="Players index top" />
      {players.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
          No player stats recorded yet — check back after games are played.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {players.map((p) => (
            <Link
              key={p.espn_id}
              href={`/${league}/players/${p.slug}`}
              className="card flex items-center gap-2 px-3 py-2 text-sm hover:-translate-y-0.5 hover:shadow-lg"
            >
              <TeamLogo name={p.name} logoUrl={p.headshot_url} color={p.team_color} size={24} />
              <span className="truncate">
                <span className="font-medium">{p.name}</span>
                {p.team_name && <span className="block text-xs text-[var(--text-muted)]">{p.team_name}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
