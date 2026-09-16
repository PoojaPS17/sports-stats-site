import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getTeamBySlug, getTeamGames } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 300;

export default async function TeamPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const team = await getTeamBySlug(league, slug);
  if (!team) notFound();

  const games = await getTeamGames(league, team.espn_id);
  const color = team.color ?? "var(--accent)";

  return (
    <div className="flex flex-col gap-6">
      <div
        className="card flex items-center gap-4 overflow-hidden px-6 py-6"
        style={{ background: `linear-gradient(135deg, ${color}1a, var(--surface))` }}
      >
        <TeamLogo name={team.name} logoUrl={team.logo_url} color={team.color} size={64} />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{LEAGUE_LABEL[league]}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{team.name}</h1>
        </div>
      </div>

      <AdSlot label="Team page top" />

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Results &amp; Schedule</h2>
        {games.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No games found.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g) => (
              <GameCard key={g.espn_id} league={league} game={g} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
