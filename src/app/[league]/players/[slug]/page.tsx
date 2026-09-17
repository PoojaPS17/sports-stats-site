import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  isLeague,
  isCricketLeague,
  LEAGUE_LABEL,
  getPlayerBySlug,
  getPlayerGameLog,
  getPlayerSeasonStatsBySeason,
  getPlayerSeasons,
  getPlayerCricketCareer,
  getPlayerCricketSplits,
  CRICKET_SPLIT_DIMENSIONS,
  type CricketSplitDimension,
} from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { SectionHeader } from "@/components/SectionHeader";
import { PlayerHeader } from "@/components/PlayerHeader";
import { PlayerSeasonStats, StatGroup } from "@/components/PlayerSeasonStats";
import { CricketCareer } from "@/components/CricketCareer";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string }> }): Promise<Metadata> {
  const { league, slug } = await params;
  if (!isLeague(league)) return {};
  const player = await getPlayerBySlug(league, slug);
  if (!player) return {};
  const team = player.team_name ? ` (${player.team_name})` : "";
  return pageMeta(`${player.name} Stats & Game Log`, `${player.name}${team} ${LEAGUE_LABEL[league]} season stats and game-by-game log.`);
}

function isSplitDimension(value: string | undefined): value is CricketSplitDimension {
  return CRICKET_SPLIT_DIMENSIONS.some((d) => d.key === value);
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string; slug: string }>;
  searchParams: Promise<{ split?: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const player = await getPlayerBySlug(league, slug);
  if (!player) notFound();

  const basePath = `/${league}/players/${slug}`;
  const gameLog = await getPlayerGameLog(league, player.espn_id);

  let cricketSection = null;
  let seasonSection = null;

  if (isCricketLeague(league)) {
    const { split: splitParam } = await searchParams;
    const activeSplit: CricketSplitDimension = isSplitDimension(splitParam) ? splitParam : "team";
    const [career, splits] = await Promise.all([
      getPlayerCricketCareer(league, player.espn_id),
      getPlayerCricketSplits(league, player.espn_id, activeSplit),
    ]);
    cricketSection = career && (
      <CricketCareer league={league} career={career} splits={splits} activeSplit={activeSplit} basePath={basePath} />
    );
  } else {
    const seasons = await getPlayerSeasons(league, player.espn_id);
    const activeSeason = seasons[0] ?? null;
    const seasonStats = activeSeason ? await getPlayerSeasonStatsBySeason(league, player.espn_id, activeSeason) : null;
    seasonSection = (
      <PlayerSeasonStats league={league} stats={seasonStats} seasons={seasons} activeSeason={activeSeason} basePath={basePath} />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          ...(player.team_name && player.team_slug ? [{ label: player.team_name, href: `/${league}/teams/${player.team_slug}` }] : []),
          { label: player.name },
        ]}
      />

      <PlayerHeader
        league={league}
        name={player.name}
        headshotUrl={player.headshot_url}
        teamName={player.team_name}
        teamSlug={player.team_slug}
        teamColor={player.team_color}
      />

      <AdSlot label="Player page top" />

      {cricketSection}
      {seasonSection}

      <section>
        <SectionHeader>Game log</SectionHeader>
        {gameLog.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No stats recorded yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {gameLog.map((row) => (
              <div key={row.game_espn_id} className="card px-4 py-3">
                <Link
                  href={`/${league}/games/${row.game_espn_id}`}
                  className="mb-2 flex items-center justify-between gap-2 text-sm hover:text-[var(--accent)]"
                >
                  <span className="flex items-center gap-2 font-semibold">
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
