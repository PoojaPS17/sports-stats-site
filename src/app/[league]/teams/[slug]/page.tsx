import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  isLeague,
  isCricketLeague,
  LEAGUE_LABEL,
  SOCCER_LEAGUES,
  getTeamBySlug,
  getTeamGamesBySeason,
  getTeamSeasons,
  getTeamRoster,
  getTeamInjuries,
  formatSeasonLabel, hasStandings } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { teamNotFound } from "@/lib/legacySlug";
import { summarizeTeamSeason } from "@/lib/teamSummary";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { RelatedLinks } from "@/components/RelatedLinks";
import { getMostFacedOpponents, getTeamTopPlayers } from "@/lib/related";
import { TeamSeasonGames } from "@/components/TeamSeasonGames";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamPageNav } from "@/components/TeamPageNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TeamLogo } from "@/components/TeamLogo";
import { h2hPath } from "@/lib/h2h";
import { supportsScoreAnalytics } from "@/lib/analytics";
import { CalendarButton } from "@/components/CalendarButton";
import { LocalTime } from "@/components/LocalTime";
import { JsonLd } from "@/components/JsonLd";
import { teamSchema } from "@/lib/structuredData";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string }> }): Promise<Metadata> {
  const { league, slug } = await params;
  if (!isLeague(league)) return {};
  const team = await getTeamBySlug(league, slug);
  if (!team) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${team.name} Schedule, Results & Roster`, `${team.name} ${label} fixtures, results, current roster, injuries and ten seasons of history.`, `/${league}/teams/${slug}`);
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const team = (await getTeamBySlug(league, slug)) ?? (await teamNotFound(league, slug));

  const seasons = await getTeamSeasons(league, team.espn_id);
  const activeSeason = seasons[0] ?? null;
  const hasInjuryFeed = !isCricketLeague(league);
  const [games, roster, injuries, rivals, topPlayers] = await Promise.all([
    activeSeason ? getTeamGamesBySeason(league, team.espn_id, activeSeason) : Promise.resolve([]),
    getTeamRoster(league, team.espn_id),
    hasInjuryFeed ? getTeamInjuries(league, team.espn_id) : Promise.resolve([]),
    supportsScoreAnalytics(league) ? getMostFacedOpponents(league, team.espn_id) : Promise.resolve([]),
    getTeamTopPlayers(league, team.espn_id),
  ]);
  // Cricket rosters carry no numbers, heights, weights or ages; a table of dashes says nothing.
  const rosterCols = {
    jersey: roster.some((p) => p.jersey),
    height: roster.some((p) => p.height),
    weight: roster.some((p) => p.weight),
    age: roster.some((p) => p.age != null),
  };

  const summary = summarizeTeamSeason(games, team.espn_id);
  const isSoccer = (SOCCER_LEAGUES as string[]).includes(league);
  const played = summary.wins + summary.losses + summary.draws;
  const record = isSoccer ? `${summary.wins}W ${summary.draws}D ${summary.losses}L` : `${summary.wins}-${summary.losses}${summary.draws ? `-${summary.draws}` : ""}`;
  const meta: string[] = [];
  if (activeSeason) meta.push(`${formatSeasonLabel(league, activeSeason)} season`);
  if (played > 0) meta.push(record);
  if (team.venue_name) meta.push(team.venue_name);

  // The feed lists every player with a note, most of them "Active" game recaps.
  // Only genuine availability concerns belong under an "Injuries" heading.
  const realInjuries = injuries.filter((i) => i.status.toLowerCase() !== "active");

  const next = summary.nextGame;
  const nextIsHome = next?.home_team_espn_id === team.espn_id;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: LEAGUE_LABEL[league], href: `/${league}` }, { label: "Teams", href: `/${league}/teams` }, { label: team.name }]} />

      <JsonLd data={teamSchema(league, team)} />
      <TeamHeader league={league} name={team.name} logoUrl={team.logo_url} color={team.color} meta={meta} />

      {(summary.form.length > 0 || next) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {summary.form.length > 0 && (
            <div className="card flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Recent form</span>
              <span className="flex gap-1" aria-label={`Last ${summary.form.length} results: ${summary.form.join(", ")}`}>
                {[...summary.form].reverse().map((r, i) => (
                  <span key={i} className={`result-badge result-${r.toLowerCase()}`}>
                    {r}
                  </span>
                ))}
              </span>
            </div>
          )}
          {next && (
            <Link href={`/${league}/games/${next.espn_id}`} className="card flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Next</span>
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <span className="text-[var(--text-muted)]">{nextIsHome ? "vs" : "at"}</span>
                <TeamLogo
                  name={nextIsHome ? next.away_name : next.home_name}
                  logoUrl={nextIsHome ? next.away_logo : next.home_logo}
                  color={nextIsHome ? next.away_color : next.home_color}
                  size={22}
                />
                <span className="truncate">{nextIsHome ? next.away_name : next.home_name}</span>
                <LocalTime iso={next.date} format="datetime" className="shrink-0 text-xs font-medium text-[var(--text-muted)]" />
              </span>
            </Link>
          )}
          {supportsScoreAnalytics(league) && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold sm:col-span-2">
              {next && (
                <Link href={h2hPath(league, slug, nextIsHome ? next.away_slug : next.home_slug)} className="text-[var(--accent)] hover:underline">
                  Head-to-head vs {nextIsHome ? next.away_name : next.home_name} →
                </Link>
              )}
              <Link href={`/${league}/compare?a=${slug}${next ? `&b=${nextIsHome ? next.away_slug : next.home_slug}` : ""}`} className="text-[var(--accent)] hover:underline">
                Compare {team.name} with another team →
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TeamPageNav basePath={`/${league}/teams/${slug}`} active="overview" />
        <CalendarButton path={`/calendar/${league}/${slug}`} label={`${team.abbreviation ?? "Team"} fixtures to calendar`} />
      </div>

      <AdSlot label="Team page top" />

      <TeamSeasonGames
        league={league}
        games={games}
        seasons={seasons}
        activeSeason={activeSeason}
        basePath={`/${league}/teams/${slug}`}
      />

      {hasInjuryFeed && realInjuries.length > 0 && (
        <section>
          <SectionHeader description="Players currently listed as unavailable or in doubt">Injuries</SectionHeader>
          <div className="card divide-y divide-[var(--border)]">
            {realInjuries.map((inj) => (
              <div key={inj.player_espn_id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{inj.player_name}</span>
                  <span className="pill pill-live">{inj.status}</span>
                </div>
                {inj.short_comment && <p className="text-sm text-[var(--text-muted)]">{inj.short_comment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader>Current roster</SectionHeader>
        {roster.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No roster data yet.</p>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className={`w-full border-collapse text-sm ${rosterCols.jersey || rosterCols.height ? "min-w-[520px]" : ""}`}>
                <thead>
                  <tr className="table-head text-left">
                    <th className="py-2 pl-4 font-semibold">Player</th>
                    <th className="py-2 font-semibold">Pos</th>
                    {rosterCols.jersey && <th className="py-2 text-right font-semibold">No.</th>}
                    {rosterCols.height && <th className="py-2 pl-4 font-semibold">Height</th>}
                    {rosterCols.weight && <th className="py-2 pl-4 font-semibold">Weight</th>}
                    {rosterCols.age && <th className="py-2 pl-4 pr-4 text-right font-semibold">Age</th>}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p) => (
                    <tr key={p.espn_id} className="table-row">
                      <td className="py-2 pl-4">
                        <Link href={`/${league}/players/${p.slug}`} className="flex items-center gap-2.5 font-medium hover:text-[var(--accent)]">
                          {p.headshot_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.headshot_url} alt="" loading="lazy" className="h-7 w-7 rounded-full bg-[var(--surface-muted)] object-cover" />
                          ) : (
                            <span className="h-7 w-7 shrink-0 rounded-full bg-[var(--surface-muted)]" />
                          )}
                          <span>
                            {p.name}
                            {p.is_captain && <span className="pill pill-feature ml-2 align-middle">C</span>}
                            {p.is_wicketkeeper && <span className="pill pill-upcoming ml-1 align-middle">WK</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2 text-[var(--text-muted)]">{p.position && !/^unknown$/i.test(p.position) ? p.position : "—"}</td>
                      {rosterCols.jersey && <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">{p.jersey ?? "—"}</td>}
                      {rosterCols.height && <td className="py-2 pl-4 text-[var(--text-muted)]">{p.height ?? "—"}</td>}
                      {rosterCols.weight && <td className="py-2 pl-4 text-[var(--text-muted)]">{p.weight ?? "—"}</td>}
                      {rosterCols.age && <td className="py-2 pl-4 pr-4 text-right tabular-nums text-[var(--text-muted)]">{p.age ?? "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
      <RelatedLinks
        groups={[
          { title: "Head-to-head", links: rivals.map((r) => ({ href: h2hPath(league, slug, r.slug), label: `${team.name} vs ${r.name}`, sub: `${r.games} meetings on record`, image: r.logo_url, imageName: r.name })) },
          { title: "Top players this season", links: topPlayers },
          {
            title: "Seasons",
            links: [
              ...seasons.slice(1, 7).map((s) => ({ href: `/${league}/teams/${slug}/${s}`, label: `${team.name} ${formatSeasonLabel(league, s)}`, sub: "Every result that season" })),
              ...(supportsScoreAnalytics(league) ? [{ href: `/${league}/teams/${slug}/history`, label: "Season-by-season history", sub: "Finishes, points and records" }] : []),
            ],
          },
          {
            title: LEAGUE_LABEL[league],
            links: [
              ...(hasStandings(league) ? [{ href: `/${league}/standings`, label: "Standings" }] : []),
              ...(supportsScoreAnalytics(league) ? [{ href: `/${league}/power-rankings`, label: "Power rankings" }, { href: `/${league}/records`, label: "Records" }] : []),
              { href: `/${league}/leaders`, label: "Leaders" },
            ],
          },
        ]}
      />

    </div>
  );
}
