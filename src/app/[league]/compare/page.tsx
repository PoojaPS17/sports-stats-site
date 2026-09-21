import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isLeague, isCricketLeague, LEAGUE_LABEL, getAllTeams, getStandings, formatSeasonLabel } from "@/lib/queries";
import { getTeamComparison } from "@/lib/compare";
import { supportsScoreAnalytics, isSoccer } from "@/lib/analytics";
import { formatWinLossTie } from "@/lib/teamSummary";
import { h2hPath } from "@/lib/h2h";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { PageHeader } from "@/components/PageHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { CompareTable } from "@/components/CompareTable";
import { ImageActions } from "@/components/ImageActions";
import { CompareExportCard } from "@/components/CompareExportCard";
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
  // A cricket league has no team compare: the page sends the visitor to the players' compare.
  if (!isLeague(league) || isCricketLeague(league)) return {};
  const { a, b } = await searchParams;
  const label = LEAGUE_LABEL[league];
  if (a && b) {
    const cmp = await getTeamComparison(league, a, b);
    if (cmp) {
      return pageMeta(
        `${cmp.a.team.name} vs ${cmp.b.team.name} Comparison`,
        `${cmp.a.team.name} and ${cmp.b.team.name} side by side: ${label} position, record, scoring, home and away form, strength rating and head-to-head.`,
        `/${league}/compare`
      );
    }
  }
  return pageMeta(`Compare ${label} Teams`, `Pick any two ${label} teams and compare their season, home and away form, strength rating and history side by side.`, `/${league}/compare`);
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
  if (!isLeague(league)) notFound();
  // Cricket has no team compare (its tables and results are not scores to compare), but the sport's
  // compare is linked from every cricket menu: land on the players' compare rather than a 404.
  if (isCricketLeague(league)) redirect(`/${league}/compare/players`);
  if (!supportsScoreAnalytics(league)) notFound();
  const { a = "", b = "" } = await searchParams;
  const label = LEAGUE_LABEL[league];

  const [allTeams, standings] = await Promise.all([getAllTeams(league), getStandings(league)]);
  // Current-season clubs first; archive-only clubs after a divider entry.
  const currentIds = new Set(standings.map((s) => s.team_espn_id));
  const teams = [...allTeams.filter((t) => currentIds.has(t.espn_id)), ...allTeams.filter((t) => !currentIds.has(t.espn_id))];

  const cmp = a && b && a !== b ? await getTeamComparison(league, a, b) : null;
  const soccer = isSoccer(league);
  // 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd (a 32-team NFL table has all of them).
  const ordinal = (n: number) => {
    const suffixes = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
  };
  type Side = NonNullable<typeof cmp>["a"];
  const positionText = (s: Side) => (s.position ? `${ordinal(s.position)} of ${s.teamsInTable}` : s.notStarted ? "Season not started" : "Not in current table");
  // Football writes W D L; the American leagues write W-L, and W-L-T once a team has a tie.
  const recordText = (s: Side) => (s.overall ? (soccer ? `${s.overall.wins}W ${s.overall.draws}D ${s.overall.losses}L` : formatWinLossTie(s.overall.wins, s.overall.losses, s.overall.draws)) : null);
  const sideOf = (s: Side) => ({
    name: teamDisplayName(s.team.name),
    logoUrl: s.team.logo_url,
    color: s.team.color,
    lines: [
      `${positionText(s)}${recordText(s) ? ` · ${recordText(s)}` : ""}`,
      ...(s.form.length > 0 ? [`Form ${[...s.form].reverse().join(" ")}`] : []),
    ],
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={cmp ? `${teamDisplayName(cmp.a.team.name)} vs ${teamDisplayName(cmp.b.team.name)}` : `Compare ${label} Teams`} subtitle={cmp && cmp.season ? `${formatSeasonLabel(league, cmp.season)} season, side by side` : "Pick any two teams to see them side by side"}>
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
                <TeamLogo name={teamDisplayName(s.team.name)} logoUrl={s.team.logo_url} color={s.team.color} size={44} priority />
                <span className="min-w-0">
                  <span className="block truncate text-base font-bold">{teamDisplayName(s.team.name)}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {positionText(s)}
                    {recordText(s) ? ` · ${recordText(s)}` : ""}
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
                {cmp.a.team.abbreviation ?? teamDisplayName(cmp.a.team.name)} <span className="text-[var(--win)]">{cmp.h2h.winsA}</span>
                {soccer && (
                  <>
                    {" · "}
                    <span className="text-[var(--draw)]">{cmp.h2h.draws}</span>
                  </>
                )}
                {" · "}
                <span className="text-[var(--win)]">{cmp.h2h.winsB}</span> {cmp.b.team.abbreviation ?? teamDisplayName(cmp.b.team.name)}
              </span>
              <span className="text-xs text-[var(--text-muted)]">{cmp.h2h.meetings} meetings on record</span>
              <span className="ml-auto text-xs font-semibold text-[var(--accent)]">Full history →</span>
            </Link>
          )}

          <ImageActions
            filename={`${league}-compare-${cmp.a.team.slug}-vs-${cmp.b.team.slug}`}
            shareTitle={`${teamDisplayName(cmp.a.team.name)} vs ${teamDisplayName(cmp.b.team.name)}`}
            width={820}
            card={
              <CompareExportCard
                league={league}
                title={`${teamDisplayName(cmp.a.team.name)} vs ${teamDisplayName(cmp.b.team.name)}`}
                subtitle={cmp.season ? `${formatSeasonLabel(league, cmp.season)} season, side by side` : null}
                a={sideOf(cmp.a)}
                b={sideOf(cmp.b)}
                groups={cmp.groups}
                nameA={cmp.a.team.abbreviation ?? teamDisplayName(cmp.a.team.name)}
                nameB={cmp.b.team.abbreviation ?? teamDisplayName(cmp.b.team.name)}
              />
            }
          />
          <CompareTable groups={cmp.groups} colorA={cmp.a.team.color} colorB={cmp.b.team.color} nameA={cmp.a.team.abbreviation ?? teamDisplayName(cmp.a.team.name)} nameB={cmp.b.team.abbreviation ?? teamDisplayName(cmp.b.team.name)} />
        </>
      )}
    </div>
  );
}
