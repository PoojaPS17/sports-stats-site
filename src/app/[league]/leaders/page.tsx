import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, LEADER_CATEGORIES, getLeaders, getLeadersSeason, formatSeasonLabel } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { PageHeader } from "@/components/PageHeader";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  const cats = LEADER_CATEGORIES[league].map((c) => c.label.toLowerCase()).join(", ");
  return pageMeta(`${label} Leaders`, `${label} statistical leaders this season: ${cats}.`);
}

export default async function LeadersPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const categories = LEADER_CATEGORIES[league];
  const [boards, season] = await Promise.all([
    Promise.all(categories.map((c) => getLeaders(league, c.column, 10))),
    getLeadersSeason(league),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${LEAGUE_LABEL[league]} Leaders`}
        subtitle={season ? `${formatSeasonLabel(league, season)} season totals` : "No season stats yet"}
      />
      <AdSlot label={`${LEAGUE_LABEL[league]} leaders top`} />

      {boards.every((b) => b.length === 0) ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No season stats yet. Check back once more games have been played.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {categories.map((cat, i) => (
            <section key={cat.column} className="card overflow-hidden">
              <h2 className="table-head border-b border-[var(--border)] px-4 py-2.5">{cat.label}</h2>
              {boards[i].length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--text-muted)]">No data yet.</p>
              ) : (
                <ol>
                  {boards[i].map((row, rank) => (
                    <li key={row.player_espn_id} className="table-row first:border-t-0">
                      <Link href={`/${league}/players/${row.slug}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className={`w-5 text-right text-xs tabular-nums ${rank === 0 ? "font-bold text-[var(--accent)]" : "text-[var(--text-muted)]"}`}>
                            {rank + 1}
                          </span>
                          <TeamLogo name={row.name} logoUrl={row.headshot_url} size={26} />
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{row.name}</span>
                            {row.team_name && <span className="block text-xs text-[var(--text-muted)]">{row.team_name}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 text-base font-bold tabular-nums">
                          {row.value} <span className="text-[11px] font-semibold uppercase text-[var(--text-faint)]">{cat.unit}</span>
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
