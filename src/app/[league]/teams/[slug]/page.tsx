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
  formatSeasonLabel,
} from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { summarizeTeamSeason } from "@/lib/teamSummary";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamSeasonGames } from "@/components/TeamSeasonGames";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamPageNav } from "@/components/TeamPageNav";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string }> }): Promise<Metadata> {
  const { league, slug } = await params;
  if (!isLeague(league)) return {};
  const team = await getTeamBySlug(league, slug);
  if (!team) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${team.name} Schedule, Results & Roster`, `${team.name} ${label} fixtures, results, current roster, injuries and ten seasons of history.`);
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const team = await getTeamBySlug(league, slug);
  if (!team) notFound();

  const seasons = await getTeamSeasons(league, team.espn_id);
  const activeSeason = seasons[0] ?? null;
  const hasInjuryFeed = !isCricketLeague(league);
  const [games, roster, injuries] = await Promise.all([
    activeSeason ? getTeamGamesBySeason(league, team.espn_id, activeSeason) : Promise.resolve([]),
    getTeamRoster(league, team.espn_id),
    hasInjuryFeed ? getTeamInjuries(league, team.espn_id) : Promise.resolve([]),
  ]);

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
                <span className="shrink-0 text-xs font-medium text-[var(--text-muted)]">
                  {new Date(next.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </span>
              </span>
            </Link>
          )}
        </div>
      )}

      <TeamPageNav basePath={`/${league}/teams/${slug}`} active="overview" />

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
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="table-head text-left">
                    <th className="py-2 pl-4 font-semibold">Player</th>
                    <th className="py-2 font-semibold">Pos</th>
                    <th className="py-2 text-right font-semibold">No.</th>
                    <th className="py-2 pl-4 font-semibold">Height</th>
                    <th className="py-2 pl-4 font-semibold">Weight</th>
                    <th className="py-2 pl-4 pr-4 text-right font-semibold">Age</th>
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
                      <td className="py-2 text-[var(--text-muted)]">{p.position ?? "—"}</td>
                      <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">{p.jersey ?? "—"}</td>
                      <td className="py-2 pl-4 text-[var(--text-muted)]">{p.height ?? "—"}</td>
                      <td className="py-2 pl-4 text-[var(--text-muted)]">{p.weight ?? "—"}</td>
                      <td className="py-2 pl-4 pr-4 text-right tabular-nums text-[var(--text-muted)]">{p.age ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
