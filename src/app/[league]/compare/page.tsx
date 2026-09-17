import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, getAllTeams, getStandings, formatSeasonLabel } from "@/lib/queries";
import { getTeamComparison } from "@/lib/compare";
import { supportsScoreAnalytics, isSoccer } from "@/lib/analytics";
import { h2hPath } from "@/lib/h2h";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { PageHeader } from "@/components/PageHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { CompareTable } from "@/components/CompareTable";
import { CompareModeTabs } from "@/components/CompareModeTabs";

export const revalidate = 600;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const { a, b } = await searchParams;
  const label = LEAGUE_LABEL[league];
  if (a && b) {
    const cmp = await getTeamComparison(league, a, b);
    if (cmp) {
      return pageMeta(
        `${cmp.a.team.name} vs ${cmp.b.team.name} Comparison`,
        `${cmp.a.team.name} and ${cmp.b.team.name} side by side: ${label} position, record, scoring, home and away form, strength rating and head-to-head.`
      );
    }
  }
  return pageMeta(`Compare ${label} Teams`, `Pick any two ${label} teams and compare their season, home and away form, strength rating and history side by side.`);
}

function TeamSelect({ name, label, teams, value }: { name: string; label: string; teams: { slug: string; name: string }[]; value: string }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      <select
        name={name}
        defaultValue={value}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
      >
        <option value="">Choose a team</option>
        {teams.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default async function CompareTeamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { league } = await params;
  if (!isLeague(league) || !supportsScoreAnalytics(league)) notFound();
  const { a = "", b = "" } = await searchParams;
  const label = LEAGUE_LABEL[league];

  const [allTeams, standings] = await Promise.all([getAllTeams(league), getStandings(league)]);
  // Current-season clubs first; archive-only clubs after a divider entry.
  const currentIds = new Set(standings.map((s) => s.team_espn_id));
  const teams = [...allTeams.filter((t) => currentIds.has(t.espn_id)), ...allTeams.filter((t) => !currentIds.has(t.espn_id))];

  const cmp = a && b && a !== b ? await getTeamComparison(league, a, b) : null;
  const soccer = isSoccer(league);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={cmp ? `${cmp.a.team.name} vs ${cmp.b.team.name}` : `Compare ${label} Teams`} subtitle={cmp && cmp.season ? `${formatSeasonLabel(league, cmp.season)} season, side by side` : "Pick any two teams to see them side by side"}>
        <CompareModeTabs league={league} active="teams" />
      </PageHeader>

      <form method="get" action={`/${league}/compare`} className="card flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end">
        <TeamSelect name="a" label="Team A" teams={teams} value={a} />
        <span className="hidden pb-2 text-sm font-bold text-[var(--text-faint)] sm:block">vs</span>
        <TeamSelect name="b" label="Team B" teams={teams} value={b} />
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]">
          Compare
        </button>
      </form>

      <AdSlot label={`${label} compare top`} />

      {a && b && !cmp && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Choose two different {label} teams to compare.</p>}

      {cmp && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {[cmp.a, cmp.b].map((s) => (
              <Link key={s.team.espn_id} href={`/${league}/teams/${s.team.slug}`} className="card flex items-center gap-3 px-4 py-3" style={{ borderTop: `3px solid ${s.team.color ?? "var(--accent)"}` }}>
                <TeamLogo name={s.team.name} logoUrl={s.team.logo_url} color={s.team.color} size={44} />
                <span className="min-w-0">
                  <span className="block truncate text-base font-bold">{s.team.name}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {s.position ? `${s.position}${s.position === 1 ? "st" : s.position === 2 ? "nd" : s.position === 3 ? "rd" : "th"} of ${s.teamsInTable}` : "Not in current table"}
                    {s.overall ? ` · ${s.overall.wins}${soccer ? `W ${s.overall.draws}D ${s.overall.losses}L` : `-${s.overall.losses}`}` : ""}
                  </span>
                  {s.form.length > 0 && (
                    <span className="mt-1 flex gap-1">
                      {[...s.form].reverse().map((r, i) => (
                        <span key={i} className={`result-badge result-${r.toLowerCase()}`}>
                          {r}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>

          {cmp.h2h && cmp.h2h.meetings > 0 && (
            <Link href={h2hPath(league, cmp.a.team.slug, cmp.b.team.slug)} className="card flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Head-to-head</span>
              <span className="font-semibold">
                {cmp.a.team.abbreviation ?? cmp.a.team.name} <span className="text-[var(--win)]">{cmp.h2h.winsA}</span>
                {soccer && (
                  <>
                    {" · "}
                    <span className="text-[var(--draw)]">{cmp.h2h.draws}</span>
                  </>
                )}
                {" · "}
                <span className="text-[var(--win)]">{cmp.h2h.winsB}</span> {cmp.b.team.abbreviation ?? cmp.b.team.name}
              </span>
              <span className="text-xs text-[var(--text-muted)]">{cmp.h2h.meetings} meetings on record</span>
              <span className="ml-auto text-xs font-semibold text-[var(--accent)]">Full history →</span>
            </Link>
          )}

          <CompareTable groups={cmp.groups} colorA={cmp.a.team.color} colorB={cmp.b.team.color} nameA={cmp.a.team.abbreviation ?? cmp.a.team.name} nameB={cmp.b.team.abbreviation ?? cmp.b.team.name} />
        </>
      )}
    </div>
  );
}
