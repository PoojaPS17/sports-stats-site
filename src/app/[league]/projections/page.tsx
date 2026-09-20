import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { getSeasonProjection, supportsProjections } from "@/lib/simulator";
import { isSoccer } from "@/lib/analytics";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { LocalTime } from "@/components/LocalTime";
import { ImageActions } from "@/components/ImageActions";
import { ProjectionTableExportCard, UpcomingProbabilityExportCard } from "@/components/ProjectionsExportCards";

// Simulated from the table as it stands (and a week's horizon from the clock), so it moves.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  const what = league === "ucl" ? "round-of-16, knockout-playoff and elimination" : isSoccer(league) ? "title, top-four and relegation" : league === "nfl" ? "division, playoff and top-seed" : "playoff, play-in and top-seed";
  return pageMeta(`${label} Season Projections`, `${label} ${what} probabilities for every team, from thousands of simulated seasons updated after each result.`, `/${league}/projections`);
}

function pct(p: number): string {
  if (p >= 0.995) return ">99%";
  if (p > 0 && p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

function Prob({ p, negative = false }: { p: number; negative?: boolean }) {
  const strength = Math.min(1, p);
  const bg = negative ? `rgba(220, 38, 38, ${0.05 + strength * 0.35})` : `rgba(29, 78, 216, ${0.05 + strength * 0.35})`;
  return (
    <td className="px-2 py-2 text-right tabular-nums">
      <span className={`inline-block min-w-[3.5rem] rounded-md px-1.5 py-0.5 text-center text-sm ${p >= 0.5 ? "font-bold" : "font-medium"}`} style={{ background: p > 0 ? bg : "transparent" }}>
        {p === 0 ? <span className="text-[var(--text-faint)]">—</span> : pct(p)}
      </span>
    </td>
  );
}

export default async function ProjectionsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league) || !supportsProjections(league)) notFound();
  const proj = await getSeasonProjection(league);
  if (!proj) notFound();

  const label = LEAGUE_LABEL[league];
  const soccer = isSoccer(league);
  const unit = soccer ? "Pts" : "W";
  const grouped = league === "nfl" || league === "nba";
  const groups = grouped ? [...new Set(proj.teams.map((t) => t.conference ?? "League"))] : ["all"];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${label} Season Projections`}
        subtitle={
          proj.finished
            ? `${formatSeasonLabel(league, proj.season)} season is complete. Final positions shown.`
            : proj.preseason
              ? `${formatSeasonLabel(league, proj.season)} season, before the first game. Based on ratings carried over from last season.`
              : `${formatSeasonLabel(league, proj.season)} season · ${proj.playedGames} games played, ${proj.remainingGames} to go · ${proj.simulations.toLocaleString()} simulations`
        }
      />
      <AdSlot label={`${label} projections top`} />

      {proj.upcoming.length > 0 && (
        <section>
          <SectionHeader
            description="Model win probability for games in the next seven days"
            tools={<ImageActions filename={`${league}-win-probabilities`} shareTitle={`${label} win probabilities this week`} width={820} card={<UpcomingProbabilityExportCard league={league} proj={proj} title={`${label} win probabilities this week`} />} />}
          >
            This week
          </SectionHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {proj.upcoming.map(({ game, homeWin, draw, awayWin }) => (
              <Link key={game.espn_id} href={`/${league}/games/${game.espn_id}`} className="card flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                  <LocalTime iso={game.date} format="datetime" />
                </div>
                <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamLogo name={teamDisplayName(game.away_name)} logoUrl={game.away_logo} color={game.away_color} size={22} />
                    <span className="truncate">{game.away_abbr ?? teamDisplayName(game.away_name)}</span>
                  </span>
                  <span className="text-[var(--text-faint)]">at</span>
                  <span className="flex min-w-0 items-center justify-end gap-2">
                    <span className="truncate">{game.home_abbr ?? teamDisplayName(game.home_name)}</span>
                    <TeamLogo name={teamDisplayName(game.home_name)} logoUrl={game.home_logo} color={game.home_color} size={22} />
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]" aria-hidden="true">
                  <span className="h-full" style={{ width: `${awayWin * 100}%`, background: game.away_color ?? "var(--accent-2)" }} />
                  {soccer && <span className="h-full bg-[var(--draw)]" style={{ width: `${draw * 100}%` }} />}
                  <span className="h-full flex-1" style={{ background: game.home_color ?? "var(--accent)" }} />
                </div>
                <div className="flex justify-between text-xs tabular-nums text-[var(--text-muted)]">
                  <span className={awayWin > homeWin ? "font-bold text-[var(--text)]" : ""}>{pct(awayWin)}</span>
                  {soccer && <span>draw {pct(draw)}</span>}
                  <span className={homeWin > awayWin ? "font-bold text-[var(--text)]" : ""}>{pct(homeWin)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-6">
        <SectionHeader
          description={`Chance of each outcome, from ${proj.simulations.toLocaleString()} simulated seasons. Sorted by projected finish.`}
          tools={
            <ImageActions
              filename={`${league}-season-projections`}
              shareTitle={`${label} season projections`}
              width={1100}
              card={<ProjectionTableExportCard league={league} proj={proj} title={`${label} projected ${soccer ? "table" : "standings"}`} subtitle={`${formatSeasonLabel(league, proj.season)} season. Chance of each outcome from ${proj.simulations.toLocaleString()} simulated seasons.`} />}
            />
          }
        >
          Projected {soccer ? "table" : "standings"}
        </SectionHeader>
        {groups.map((groupKey) => {
          const rows = grouped ? proj.teams.filter((t) => (t.conference ?? "League") === groupKey) : proj.teams;
          return (
            <div key={groupKey} className="card overflow-hidden">
              {grouped && <h3 className="table-head border-b border-[var(--border)] px-4 py-2.5">{groupKey}</h3>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                      <th className="py-2 pl-4 text-left font-semibold">Team</th>
                      <th className="px-2 py-2 text-right font-semibold" title="Record so far">
                        Now
                      </th>
                      <th className="px-2 py-2 text-right font-semibold" title={`Projected final ${soccer ? "points" : "wins"} (average of simulations)`}>
                        Proj. {unit}
                      </th>
                      <th className="px-2 py-2 text-right font-semibold" title="Range covering 90% of simulations">
                        Range
                      </th>
                      <th className="px-2 py-2 text-right font-semibold" title="Average finishing position across simulations">
                        Avg pos
                      </th>
                      {proj.columns.map((c) => (
                        <th key={c.key} className="px-2 py-2 text-right font-semibold" title={c.title}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.team.espn_id} className="table-row">
                        <td className="py-2 pl-4">
                          <Link href={`/${league}/teams/${t.team.slug}`} className="flex items-center gap-2.5 whitespace-nowrap font-medium hover:text-[var(--accent)]">
                            <TeamLogo name={teamDisplayName(t.team.name)} logoUrl={t.team.logo_url} color={t.team.color} size={22} />
                            <span className="truncate">{teamDisplayName(t.team.name)}</span>
                            {t.division && <span className="text-[10px] font-semibold uppercase text-[var(--text-faint)]">{t.division.replace(/^(AFC|NFC)\s+/, "")}</span>}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                          {soccer ? `${t.pointsNow} pts` : `${t.wins}-${t.losses}`}
                          <span className="ml-1 text-[10px] text-[var(--text-faint)]">#{t.positionNow}</span>
                        </td>
                        <td className="px-2 py-2 text-right font-bold tabular-nums">{t.expectedPoints.toFixed(1)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                          {t.pointsRange[0]}–{t.pointsRange[1]}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{t.expectedPosition.toFixed(1)}</td>
                        {proj.columns.map((c) => (
                          <Prob key={c.key} p={t.outcomes[c.key]} negative={c.key === "relegation" || c.key === "out"} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card px-5 py-4 text-sm text-[var(--text-muted)]">
        <h2 className="mb-1 text-sm font-bold text-[var(--text)]">How the projection works</h2>
        <p>
          Every remaining game is given a win probability from the two teams&apos; Elo ratings (see Power Rankings),
          with a home-ground allowance{soccer ? " and a draw share that shrinks as the matchup gets more lopsided" : ""}. The rest
          of the season is then played out {proj.simulations.toLocaleString()} times at random with those probabilities, and each
          outcome is the share of simulations in which it happened. Ties on {soccer ? "points are broken by goal difference, then" : "record are broken"} at random.
          Injuries, transfers and schedule congestion are not modelled, so treat the numbers as a well-informed estimate, not a
          forecast. Ratings as of {proj.ratingsAsOf ? new Date(proj.ratingsAsOf).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "the latest result"}.
        </p>
      </section>
    </div>
  );
}
