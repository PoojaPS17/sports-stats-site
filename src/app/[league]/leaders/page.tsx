import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, LEADER_CATEGORIES, getLeaders, getLeadersSeason, formatSeasonLabel } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 300;

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
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} League Leaders</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {season ? `${formatSeasonLabel(league, season)} season totals` : "No season stats yet"}
        </p>
      </div>
      <AdSlot label={`${LEAGUE_LABEL[league]} leaders top`} />

      {boards.every((b) => b.length === 0) ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
          No season stats yet — check back once more games have been played.
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {categories.map((cat, i) => (
            <section key={cat.column} className="card overflow-hidden">
              <h2 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {cat.label}
              </h2>
              {boards[i].length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--text-muted)]">No data yet.</p>
              ) : (
                <ol>
                  {boards[i].map((row, rank) => (
                    <li key={row.player_espn_id} className="border-t border-[var(--border)] first:border-t-0">
                      <Link
                        href={`/${league}/players/${row.slug}`}
                        className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm hover:bg-[var(--surface-muted)]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span className="w-4 text-xs text-[var(--text-muted)]">{rank + 1}</span>
                          <TeamLogo name={row.name} logoUrl={row.headshot_url} size={24} />
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{row.name}</span>
                            {row.team_name && <span className="block text-xs text-[var(--text-muted)]">{row.team_name}</span>}
                          </span>
                        </span>
                        <span className="shrink-0 font-bold tabular-nums">
                          {row.value} <span className="text-xs font-normal text-[var(--text-muted)]">{cat.unit}</span>
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
