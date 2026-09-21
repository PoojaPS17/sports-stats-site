import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLeague, isCupCompetition, hasTies, LEAGUE_LABEL, getTeamBySlug, formatSeasonLabel } from "@/lib/queries";
import { getTeamHistory, isSoccer } from "@/lib/analytics";
import { pageMeta } from "@/lib/metadata";
import { teamNotFound } from "@/lib/legacySlug";
import { AdSlot } from "@/components/AdSlot";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamPageNav } from "@/components/TeamPageNav";
import { SectionHeader } from "@/components/SectionHeader";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PositionChart } from "@/components/PositionChart";
import { ImageActions } from "@/components/ImageActions";
import { TeamHistoryExportCard } from "@/components/TeamHistoryExportCard";

// Every season in the standings, the one in progress included, so the finishes and the
// best/worst/average tiles move during a season. Held to the five-minute cap (next.config.ts).
export const revalidate = 300;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand and 404 (dynamicParams is left at its default).
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; slug: string }> }): Promise<Metadata> {
  const { league, slug } = await params;
  if (!isLeague(league)) return {};
  const team = await getTeamBySlug(league, slug);
  if (!team) return {};
  return pageMeta(`${team.name} ${LEAGUE_LABEL[league]} Season History`, `${team.name} ${LEAGUE_LABEL[league]} finishes, records and points for every season on record.`, `/${league}/teams/${slug}/history`);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export default async function TeamHistoryPage({ params }: { params: Promise<{ league: string; slug: string }> }) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();
  const team = (await getTeamBySlug(league, slug)) ?? (await teamNotFound(league, slug, "/history"));

  const history = await getTeamHistory(league, team.espn_id);
  const played = history.filter((h) => h.played);
  const soccer = isSoccer(league);
  const ties = hasTies(league);

  const best = played.length ? played.reduce((a, b) => (b.position < a.position ? b : a)) : null;
  const worst = played.length ? played.reduce((a, b) => (b.position > a.position ? b : a)) : null;
  const titles = played.filter((h) => h.position === 1);
  const avgPos = played.length ? played.reduce((s, h) => s + h.position, 0) / played.length : null;

  const summary = [
    { label: soccer && !isCupCompetition(league) ? "Titles" : "1st-place finishes", value: titles.length, sub: titles.map((t) => formatSeasonLabel(league, t.season)).join(", ") || "None on record" },
    { label: "Best finish", value: best ? ordinal(best.position) : "—", sub: best ? formatSeasonLabel(league, best.season) ?? "" : "" },
    { label: "Lowest finish", value: worst ? ordinal(worst.position) : "—", sub: worst ? formatSeasonLabel(league, worst.season) ?? "" : "" },
    { label: "Average finish", value: avgPos ? avgPos.toFixed(1) : "—", sub: `across ${played.length} seasons` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs
        items={[
          { label: LEAGUE_LABEL[league], href: `/${league}` },
          { label: "Teams", href: `/${league}/teams` },
          { label: teamDisplayName(team.name), href: `/${league}/teams/${slug}` },
          { label: "History" },
        ]}
      />

      <TeamHeader league={league} slug={slug} name={teamDisplayName(team.name)} logoUrl={team.logo_url} color={team.color} meta={played.length ? [`${played.length} seasons on record`] : undefined} />

      <TeamPageNav basePath={`/${league}/teams/${slug}`} active="history" />

      <AdSlot label="Team history top" />

      {played.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No completed seasons on record for {teamDisplayName(team.name)} yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map((s) => (
              <div key={s.label} className="card flex flex-col gap-0.5 px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{s.label}</span>
                <span className="text-2xl font-bold tabular-nums tracking-tight">{s.value}</span>
                <span className="truncate text-xs text-[var(--text-faint)]" title={s.sub}>
                  {s.sub}
                </span>
              </div>
            ))}
          </div>

          <section>
            <SectionHeader description={isCupCompetition(league) ? "League-phase position at the end of each season (group position before 2024-25), 1st at the top" : "League position at the end of each season (1st at the top)"}>Finish by season</SectionHeader>
            <PositionChart league={league} rows={history} color={team.color} />
          </section>

          <section>
            <SectionHeader tools={<ImageActions filename={`${slug}-history-${league}`} width={860} shareTitle={`${teamDisplayName(team.name)} season history`} card={<TeamHistoryExportCard league={league} teamName={team.name} teamLogo={team.logo_url} teamColor={team.color} played={played} soccer={soccer} summary={summary} />} />}>Season by season</SectionHeader>
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                      <th className="py-2 pl-4 text-left font-semibold">Season</th>
                      <th className="px-2 py-2 text-right font-semibold">Finish</th>
                      {history.some((h) => h.conference) && <th className="px-2 py-2 text-left font-semibold">{isCupCompetition(league) ? "Stage" : "Conference"}</th>}
                      <th className="px-2 py-2 text-right font-semibold">W</th>
                      {soccer && <th className="px-2 py-2 text-right font-semibold">D</th>}
                      <th className="px-2 py-2 text-right font-semibold">L</th>
                      {ties && <th className="px-2 py-2 text-right font-semibold">T</th>}
                      {soccer ? (
                        <>
                          <th className="px-2 py-2 text-right font-semibold">GF</th>
                          <th className="px-2 py-2 text-right font-semibold">GA</th>
                          <th className="py-2 pl-2 pr-4 text-right font-semibold">Pts</th>
                        </>
                      ) : (
                        <th className="py-2 pl-2 pr-4 text-right font-semibold">Pct</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[...played].reverse().map((h) => (
                      <tr key={h.season} className="table-row">
                        <td className="py-2.5 pl-4">
                          <Link href={`/${league}/standings/${h.season}`} className="font-medium hover:text-[var(--accent)]">
                            {formatSeasonLabel(league, h.season)}
                          </Link>
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">
                          <span className={`font-bold ${h.position === 1 ? "text-[var(--win)]" : ""}`}>{ordinal(h.position)}</span>
                          <span className="text-xs text-[var(--text-faint)]"> / {h.teamsInSeason}</span>
                        </td>
                        {history.some((x) => x.conference) && <td className="px-2 py-2.5 text-xs text-[var(--text-muted)]">{h.conference ?? "—"}</td>}
                        <td className="px-2 py-2.5 text-right tabular-nums">{h.wins}</td>
                        {soccer && <td className="px-2 py-2.5 text-right tabular-nums">{h.draws ?? 0}</td>}
                        <td className="px-2 py-2.5 text-right tabular-nums">{h.losses}</td>
                        {ties && <td className="px-2 py-2.5 text-right tabular-nums">{h.draws ?? 0}</td>}
                        {soccer ? (
                          <>
                            <td className="px-2 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{h.goals_for ?? "—"}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{h.goals_against ?? "—"}</td>
                            <td className="py-2.5 pl-2 pr-4 text-right font-bold tabular-nums">{h.points ?? "—"}</td>
                          </>
                        ) : (
                          <td className="py-2.5 pl-2 pr-4 text-right font-bold tabular-nums">{h.win_percent ? Number(h.win_percent).toFixed(3) : "—"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
