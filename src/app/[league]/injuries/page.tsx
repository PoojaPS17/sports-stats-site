import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL } from "@/lib/queries";
import { getLeagueInjuries, supportsInjuryTracker } from "@/lib/analytics";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { PageHeader } from "@/components/PageHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { ImageActions } from "@/components/ImageActions";
import { InjuriesExportCard } from "@/components/InjuriesExportCard";

export const revalidate = 900;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} Injury Report`, `League-wide ${label} injury report: every player listed as out, doubtful, questionable or on injured reserve, by team.`, `/${league}/injuries`);
}

const STATUS_ORDER = ["Out", "Injured Reserve", "Doubtful", "Questionable", "Day-To-Day", "Suspension"];

function statusTone(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("out") || s.includes("reserve") || s.includes("suspen")) return "pill-live";
  if (s.includes("doubt")) return "pill-upcoming";
  return "pill-final";
}

export default async function InjuriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { league } = await params;
  if (!isLeague(league) || !supportsInjuryTracker(league)) notFound();
  const { status: statusFilter } = await searchParams;

  const all = await getLeagueInjuries(league);
  const statuses = [...new Set(all.map((i) => i.status))].sort((a, b) => {
    const ia = STATUS_ORDER.indexOf(a);
    const ib = STATUS_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const active = statusFilter && statuses.includes(statusFilter) ? statusFilter : null;
  const rows = active ? all.filter((i) => i.status === active) : all;

  const byTeam = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byTeam.has(r.team.espn_id)) byTeam.set(r.team.espn_id, []);
    byTeam.get(r.team.espn_id)!.push(r);
  }
  const label = LEAGUE_LABEL[league];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${label} Injury Report`} subtitle={`${all.length} players listed across ${new Set(all.map((i) => i.team.espn_id)).size} teams`} />
      <AdSlot label={`${label} injuries top`} />

      <div className="flex flex-wrap gap-1.5">
        <Link href={`/${league}/injuries`} className={`nav-pill ${!active ? "nav-pill-active" : ""}`}>
          All <span className="ml-1 text-xs opacity-70">{all.length}</span>
        </Link>
        {statuses.map((s) => (
          <Link key={s} href={`/${league}/injuries?status=${encodeURIComponent(s)}`} className={`nav-pill ${active === s ? "nav-pill-active" : ""}`}>
            {s} <span className="ml-1 text-xs opacity-70">{all.filter((i) => i.status === s).length}</span>
          </Link>
        ))}
      </div>

      {byTeam.size === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No players listed right now.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ImageActions
            filename={`${league}-injuries${active ? `-${active.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`}
            shareTitle={`${label} injury report`}
            width={980}
            card={<InjuriesExportCard league={league} rows={rows} title={`${label} injury report${active ? `: ${active}` : ""}`} subtitle={`${rows.length} players across ${byTeam.size} teams`} />}
          />
          <div className="grid gap-4 md:grid-cols-2">
            {[...byTeam.values()].map((list) => {
              const team = list[0].team;
              return (
                <section key={team.espn_id} className="card overflow-hidden">
                  <Link href={`/${league}/teams/${team.slug}`} className="flex items-center gap-2.5 border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 hover:text-[var(--accent)]">
                    <TeamLogo name={team.name} logoUrl={team.logo_url} color={team.color} size={22} />
                    <span className="text-sm font-bold">{team.name}</span>
                    <span className="ml-auto text-xs text-[var(--text-muted)]">{list.length}</span>
                  </Link>
                  <ul className="divide-y divide-[var(--border)]">
                    {list.map((i) => (
                      <li key={i.player_espn_id} className="flex flex-col gap-1 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {i.player_slug ? (
                            <Link href={`/${league}/players/${i.player_slug}`} className="font-semibold hover:text-[var(--accent)]">
                              {i.player_name}
                            </Link>
                          ) : (
                            <span className="font-semibold">{i.player_name}</span>
                          )}
                          {i.position && <span className="text-xs text-[var(--text-faint)]">{i.position}</span>}
                          <span className={`pill ml-auto ${statusTone(i.status)}`}>{i.status}</span>
                        </div>
                        {i.short_comment && <p className="text-xs text-[var(--text-muted)]">{i.short_comment}</p>}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
