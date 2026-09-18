import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { getPowerRankings, supportsScoreAnalytics, type FixtureDifficultyRow } from "@/lib/analytics";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 900;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} Power Rankings`, `${label} power rankings computed from every result on record with an Elo rating, plus the toughest and easiest upcoming fixture runs.`, `/${league}/power-rankings`);
}

function RunList({ league, runs, tone }: { league: string; runs: FixtureDifficultyRow[]; tone: "hard" | "easy" }) {
  if (runs.length === 0) return <p className="px-4 py-4 text-sm text-[var(--text-muted)]">No upcoming fixtures on the schedule yet.</p>;
  return (
    <ol>
      {runs.map((r, i) => (
        <li key={r.team.espn_id} className="table-row first:border-t-0 px-4 py-2.5">
          <div className="flex items-center gap-3 text-sm">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
            <TeamLogo name={teamDisplayName(r.team.name)} logoUrl={r.team.logo_url} color={r.team.color} size={22} />
            <Link href={`/${league}/teams/${r.team.slug}`} className="min-w-0 flex-1 truncate font-semibold hover:text-[var(--accent)]">
              {teamDisplayName(r.team.name)}
            </Link>
            <span className={`shrink-0 text-sm font-bold tabular-nums ${tone === "hard" ? "text-[var(--loss)]" : "text-[var(--win)]"}`}>
              {Math.round(r.averageOpponentRating)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 pl-8">
            {r.opponents.map((o) => (
              <Link
                key={o.espn_id}
                href={`/${league}/games/${o.espn_id}`}
                title={`${o.home ? "vs" : "at"} ${teamDisplayName(o.team.name)}, rating ${Math.round(o.rating)}`}
                className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]"
              >
                <span className="text-[var(--text-faint)]">{o.home ? "vs" : "at"}</span>
                <TeamLogo name={teamDisplayName(o.team.name)} logoUrl={o.team.logo_url} color={o.team.color} size={14} />
                {o.team.abbreviation ?? teamDisplayName(o.team.name)}
              </Link>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function PowerRankingsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league) || !supportsScoreAnalytics(league)) notFound();

  const pr = await getPowerRankings(league);
  const label = LEAGUE_LABEL[league];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`${label} Power Rankings`}
        subtitle={pr.season ? `${formatSeasonLabel(league, pr.season)} season. Ratings update after every result.` : undefined}
      >
        <Link href={`/${league}/projections`} className="nav-pill nav-pill-active">
          Season projections →
        </Link>
      </PageHeader>
      <AdSlot label={`${label} power rankings top`} />

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="card overflow-hidden lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                  <th className="py-2 pl-4 text-left font-semibold">Team</th>
                  <th className="px-2 py-2 text-right font-semibold">Rating</th>
                  <th className="px-2 py-2 text-right font-semibold">Last 5</th>
                  <th className="py-2 pl-2 pr-4 text-right font-semibold">Peak</th>
                </tr>
              </thead>
              <tbody>
                {pr.rows.map((r, i) => (
                  <tr key={r.team.espn_id} className="table-row">
                    <td className="py-2.5 pl-4">
                      <Link href={`/${league}/teams/${r.team.slug}`} className="flex items-center gap-2.5 whitespace-nowrap font-medium hover:text-[var(--accent)]">
                        <span className="w-5 text-right text-xs tabular-nums text-[var(--text-muted)]">{i + 1}</span>
                        <TeamLogo name={teamDisplayName(r.team.name)} logoUrl={r.team.logo_url} color={r.team.color} size={22} />
                        <span className="truncate">{teamDisplayName(r.team.name)}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums">{Math.round(r.rating)}</td>
                    <td className={`px-2 py-2.5 text-right tabular-nums ${r.trend > 0 ? "text-[var(--win)]" : r.trend < 0 ? "text-[var(--loss)]" : "text-[var(--text-muted)]"}`}>
                      {r.trend > 0 ? "▲" : r.trend < 0 ? "▼" : ""} {Math.abs(Math.round(r.trend))}
                    </td>
                    <td className="py-2.5 pl-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">{Math.round(r.peak)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="flex flex-col gap-6">
          <div>
            <SectionHeader description="Average rating of upcoming opponents on the schedule, up to five">Toughest runs ahead</SectionHeader>
            <div className="card overflow-hidden">
              <RunList league={league} runs={pr.hardestRuns} tone="hard" />
            </div>
          </div>
          <div>
            <SectionHeader description="Average rating of upcoming opponents on the schedule, up to five">Easiest runs ahead</SectionHeader>
            <div className="card overflow-hidden">
              <RunList league={league} runs={pr.easiestRuns} tone="easy" />
            </div>
          </div>
        </aside>
      </div>

      <section className="card px-5 py-4 text-sm text-[var(--text-muted)]">
        <h2 className="mb-1 text-sm font-bold text-[var(--text)]">How the rating works</h2>
        <p>
          Every team starts at 1500. After each game, points move from the loser to the winner based on how surprising
          the result was given both ratings, with a small home-ground allowance and a damped bonus for the margin of
          victory. Between seasons every rating regresses part of the way back to 1500 to reflect roster turnover. It is
          the standard Elo method used in chess and by most sports rating sites, computed from every {label} result in
          our archive. It is a description of results so far, not a prediction service.
        </p>
      </section>
    </div>
  );
}
