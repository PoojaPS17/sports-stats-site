import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getTeamBySlug, getTeamGames } from "@/lib/queries";
import { GameRow } from "@/components/GameRow";
import { AdSlot } from "@/components/AdSlot";

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {team.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.logo_url} alt={team.name} width={48} height={48} />
        )}
        <h1 className="text-2xl font-bold">
          {team.name} <span className="text-neutral-400">({LEAGUE_LABEL[league]})</span>
        </h1>
      </div>

      <AdSlot label="Team page top" />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">Results &amp; Schedule</h2>
        <div className="rounded border border-neutral-200 px-4 dark:border-neutral-800">
          {games.length === 0 ? (
            <p className="py-6 text-sm text-neutral-500">No games found.</p>
          ) : (
            games.map((g) => <GameRow key={g.espn_id} league={league} game={g} />)
          )}
        </div>
      </section>
    </div>
  );
}
