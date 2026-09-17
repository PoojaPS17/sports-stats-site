import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getStandingsBySeason, getStandingsSeasons, getSeasonPlayoffGames, formatSeasonLabel } from "@/lib/queries";
import { summarizePlayoffs } from "@/lib/seasonSummary";
import { getComputedTable, getCurrentSeason, supportsScoreAnalytics, type TableScope } from "@/lib/analytics";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { StandingsTable } from "@/components/StandingsTable";
import { SeasonTabs } from "@/components/SeasonTabs";
import { SeasonSummary } from "@/components/SeasonSummary";
import { PageHeader } from "@/components/PageHeader";
import { StandingsViewTabs } from "@/components/StandingsViewTabs";
import { ComputedStandingsTable } from "@/components/ComputedStandingsTable";

// A past season's final table never changes, so this can be cached far longer than
// the live current-season standings page. The computed views (home/away/form) share
// this route but are live data, so they get the shorter window via the check below.
export const revalidate = 300;

const SCOPES: TableScope[] = ["home", "away", "form"];
const SCOPE_TITLE: Record<TableScope, string> = { overall: "Standings", home: "Home Table", away: "Away Table", form: "Form Table" };
const SCOPE_DESC: Record<TableScope, string> = {
  overall: "",
  home: "ranked by results in home games only",
  away: "ranked by results away from home only",
  form: "ranked by each team's last five results",
};

function asScope(value: string): TableScope | null {
  return (SCOPES as string[]).includes(value) ? (value as TableScope) : null;
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; season: string }> }): Promise<Metadata> {
  const { league, season } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  const scope = asScope(season);
  if (scope) return pageMeta(`${label} ${SCOPE_TITLE[scope]}`, `${label} ${SCOPE_TITLE[scope].toLowerCase()}, ${SCOPE_DESC[scope]}.`);
  const seasonLabel = formatSeasonLabel(league, Number(season)) ?? season;
  return pageMeta(`${label} Standings ${seasonLabel}`, `Final ${label} table for the ${seasonLabel} season.`);
}

export default async function StandingsSeasonPage({
  params,
}: {
  params: Promise<{ league: string; season: string }>;
}) {
  const { league, season: seasonParam } = await params;
  if (!isLeague(league)) notFound();

  // /standings/home, /standings/away, /standings/form → computed tables for the
  // current season.
  const scope = asScope(seasonParam);
  if (scope) {
    if (!supportsScoreAnalytics(league)) notFound();
    const current = await getCurrentSeason(league);
    const rows = current ? await getComputedTable(league, current, scope) : [];
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`${LEAGUE_LABEL[league]} ${SCOPE_TITLE[scope]}`} subtitle={current ? `${formatSeasonLabel(league, current)} season, ${SCOPE_DESC[scope]}` : undefined}>
          <StandingsViewTabs league={league} active={scope} />
        </PageHeader>
        <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />
        <ComputedStandingsTable league={league} rows={rows} scope={scope} />
      </div>
    );
  }

  const season = Number(seasonParam);
  if (!Number.isInteger(season)) notFound();

  const seasons = await getStandingsSeasons(league);
  if (!seasons.includes(season)) notFound();

  const [standings, playoffGames] = await Promise.all([
    getStandingsBySeason(league, season),
    getSeasonPlayoffGames(league, season),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${LEAGUE_LABEL[league]} Standings`} subtitle={`${formatSeasonLabel(league, season)} season`} />
      <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />

      <SeasonTabs league={league} basePath={`/${league}/standings`} seasons={seasons} activeSeason={season} />

      <SeasonSummary league={league} playoffResults={summarizePlayoffs(playoffGames)} standings={standings} />

      <StandingsTable league={league} standings={standings} />
    </div>
  );
}
