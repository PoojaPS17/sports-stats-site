import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, getPlayerBySlug, getPlayerGameLog, getPlayerSeasonStatsBySeason, getPlayerSeasons } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { SectionHeader } from "@/components/SectionHeader";
import { PlayerHeader } from "@/components/PlayerHeader";
import { PlayerSeasonStats, StatGroup } from "@/components/PlayerSeasonStats";

export const revalidate = 300;

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const player = await getPlayerBySlug(league, slug);
  if (!player) notFound();

  const seasons = await getPlayerSeasons(league, player.espn_id);
  const activeSeason = seasons[0] ?? null;
  const [gameLog, seasonStats] = await Promise.all([
    getPlayerGameLog(league, player.espn_id),
    activeSeason ? getPlayerSeasonStatsBySeason(league, player.espn_id, activeSeason) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PlayerHeader
        league={league}
        name={player.name}
        headshotUrl={player.headshot_url}
        teamName={player.team_name}
        teamColor={player.team_color}
      />

      <AdSlot label="Player page top" />

      <PlayerSeasonStats
        league={league}
        stats={seasonStats}
        seasons={seasons}
        activeSeason={activeSeason}
        basePath={`/${league}/players/${slug}`}
      />

      <section>
        <SectionHeader>Game Log</SectionHeader>
        {gameLog.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No stats recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {gameLog.map((row) => (
              <div key={row.game_espn_id} className="card px-4 py-3">
                <Link
                  href={`/${league}/teams/${row.opponent_slug}`}
                  className="mb-2 flex items-center justify-between gap-2 text-sm hover:underline"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <TeamLogo name={row.opponent_name} logoUrl={row.opponent_logo} size={20} />
                    vs {row.opponent_name}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {new Date(row.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </Link>
                <div className="grid gap-2 sm:grid-cols-2">
                  {Object.entries(row.stats).map(([category, values]) => (
                    <StatGroup key={category} category={category} values={values} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
