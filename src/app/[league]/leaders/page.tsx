import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  isLeague,
  isCricketLeague,
  isCupCompetition,
  LEAGUE_LABEL,
  LEADER_CATEGORIES,
  CRICKET_LEADER_CATEGORIES,
  getLeaders,
  getLeadersSeason,
  getCricketLeaders,
  getCricketLeadersSeason,
  formatSeasonLabel,
  type LeaderRow,
} from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { PageHeader } from "@/components/PageHeader";

export const revalidate = 300;

function categoriesFor(league: Parameters<typeof getLeaders>[0]): { label: string; unit: string }[] {
  return isCricketLeague(league) ? CRICKET_LEADER_CATEGORIES : LEADER_CATEGORIES[league];
}

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  const cats = categoriesFor(league).map((c) => c.label.toLowerCase()).join(", ");
  return pageMeta(`${label} Leaders`, `${label} statistical leaders this season: ${cats}.`, `/${league}/leaders`);
}

export default async function LeadersPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  let boards: { label: string; unit: string; rows: LeaderRow[] }[];
  let season: number | null;
  let note: string | null = null;

  if (isCricketLeague(league)) {
    season = await getCricketLeadersSeason(league);
    boards = season
      ? await Promise.all(CRICKET_LEADER_CATEGORIES.map(async (c) => ({ label: c.label, unit: c.unit, rows: await getCricketLeaders(league, c.key, season!, 10) })))
      : [];
    note = "Summed from the scorecard of every match on record for the season.";
  } else {
    const categories = LEADER_CATEGORIES[league];
    const [lists, s] = await Promise.all([Promise.all(categories.map((c) => getLeaders(league, c.column, 10))), getLeadersSeason(league)]);
    season = s;
    boards = categories.map((c, i) => ({ label: c.label, unit: c.unit, rows: lists[i] }));
    if (isCupCompetition(league)) note = "Summed from the box score of every match on record for the season, knockout rounds included.";
    if (league === "nba") note = "Per-game averages, for players who have appeared in at least 70% of the games played so far (the NBA's qualifying rule).";
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${LEAGUE_LABEL[league]} Leaders`}
        subtitle={season ? `${formatSeasonLabel(league, season)} season totals${note ? `. ${note}` : ""}` : "No season stats yet"}
      />
      <AdSlot label={`${LEAGUE_LABEL[league]} leaders top`} />

      {boards.length === 0 || boards.every((b) => b.rows.length === 0) ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No season stats yet. They fill in as games are played.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {boards.map((board) => (
            <section key={board.label} className="card overflow-hidden">
              <h2 className="table-head border-b border-[var(--border)] px-4 py-2.5">{board.label}</h2>
              {board.rows.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--text-muted)]">No data yet.</p>
              ) : (
                <ol>
                  {board.rows.map((row, rank) => (
                    <li key={row.player_espn_id} className="table-row first:border-t-0">
                      <Link href={`/${league}/players/${row.slug}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className={`w-5 text-right text-xs tabular-nums ${rank === 0 ? "font-bold text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                            {rank + 1}
                          </span>
                          <TeamLogo name={row.name} logoUrl={row.headshot_url} size={26} />
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{row.name}</span>
                            {row.team_name && <span className="block text-xs text-[var(--text-muted)]">{teamDisplayName(row.team_name)}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-base font-bold tabular-nums">
                          {row.value} <span className="text-[11px] font-semibold uppercase text-[var(--text-faint)]">{board.unit}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
