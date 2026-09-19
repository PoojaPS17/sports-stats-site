import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { isLeague, LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { getHeadToHead, isSoccer } from "@/lib/analytics";
import { pageMeta } from "@/lib/metadata";
import { h2hPath } from "@/lib/h2h";
import { AdSlot } from "@/components/AdSlot";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GameCard } from "@/components/GameCard";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { RelatedLinks } from "@/components/RelatedLinks";
import { getMostFacedOpponents } from "@/lib/related";

export const revalidate = 600;

function parsePair(pair: string): [string, string] | null {
  const idx = pair.indexOf("-vs-");
  if (idx <= 0) return null;
  const a = pair.slice(0, idx);
  const b = pair.slice(idx + 4);
  if (!a || !b || a === b) return null;
  return [a, b];
}

export async function generateMetadata({ params }: { params: Promise<{ league: string; pair: string }> }): Promise<Metadata> {
  const { league, pair } = await params;
  if (!isLeague(league)) return {};
  const slugs = parsePair(pair);
  if (!slugs) return {};
  const h2h = await getHeadToHead(league, slugs[0], slugs[1]);
  if (!h2h) return {};
  const record = `${h2h.winsA}-${h2h.draws}-${h2h.winsB}`;
  return pageMeta(
    `${h2h.teamA.name} vs ${h2h.teamB.name} Head-to-Head`,
    `${h2h.teamA.name} vs ${h2h.teamB.name} all-time ${LEAGUE_LABEL[league]} record (${record} in ${h2h.meetings} meetings), recent results and biggest wins.`,
    h2hPath(league, slugs[0], slugs[1])
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-3 text-center">
      <span className="text-2xl font-bold tabular-nums tracking-tight">{value}</span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</span>
      {sub && <span className="text-xs text-[var(--text-faint)]">{sub}</span>}
    </div>
  );
}

export default async function HeadToHeadPage({ params }: { params: Promise<{ league: string; pair: string }> }) {
  const { league, pair } = await params;
  if (!isLeague(league)) notFound();
  const slugs = parsePair(pair);
  if (!slugs) notFound();

  // One canonical URL per pairing: alphabetical order.
  const canonical = h2hPath(league, slugs[0], slugs[1]);
  if (canonical !== `/${league}/h2h/${pair}`) permanentRedirect(canonical);

  const h2h = await getHeadToHead(league, slugs[0], slugs[1]);
  if (!h2h) notFound();

  const soccer = isSoccer(league);
  const scoreWord = soccer ? "Goals" : "Points";
  const total = h2h.meetings || 1;
  const pctA = (h2h.winsA / total) * 100;
  const pctD = (h2h.draws / total) * 100;
  const { teamA, teamB } = h2h;
  const [rivalsA, rivalsB] = await Promise.all([getMostFacedOpponents(league, teamA.espn_id, 7), getMostFacedOpponents(league, teamB.espn_id, 7)]);
  const rivalLinks = (team: typeof teamA, other: typeof teamA, rivals: typeof rivalsA) =>
    rivals.filter((r) => r.espn_id !== other.espn_id).slice(0, 6).map((r) => ({ href: h2hPath(league, team.slug, r.slug), label: `${teamDisplayName(team.name)} vs ${teamDisplayName(r.name)}`, sub: `${r.games} meetings on record`, image: r.logo_url, imageName: r.name }));

  const streakText =
    h2h.streak && h2h.streak.length > 1
      ? h2h.streak.team === "A"
        ? `${teamDisplayName(teamA.name)} have won the last ${h2h.streak.length}`
        : h2h.streak.team === "B"
          ? `${teamDisplayName(teamB.name)} have won the last ${h2h.streak.length}`
          : `The last ${h2h.streak.length} meetings were drawn`
      : null;

  return (
    <div className="flex flex-col gap-8">
      <Breadcrumbs items={[{ label: LEAGUE_LABEL[league], href: `/${league}` }, { label: "Head-to-head" }, { label: `${teamDisplayName(teamA.name)} vs ${teamDisplayName(teamB.name)}` }]} />

      <div>
        <h1 className="page-title">
          {teamDisplayName(teamA.name)} vs {teamDisplayName(teamB.name)}: head-to-head record
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {h2h.meetings} {LEAGUE_LABEL[league]} {h2h.meetings === 1 ? "meeting" : "meetings"} on record
        </p>
      </div>

      <section className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6 sm:px-8">
          <Link href={`/${league}/teams/${teamA.slug}`} className="flex flex-col items-center gap-2 text-center hover:text-[var(--accent)]">
            <TeamLogo name={teamDisplayName(teamA.name)} logoUrl={teamA.logo_url} color={teamA.color} size={64} />
            <span className="text-base font-bold sm:text-lg">{teamDisplayName(teamA.name)}</span>
          </Link>
          <div className="flex flex-col items-center">
            <span className="text-3xl font-extrabold tabular-nums tracking-tight sm:text-4xl">
              {h2h.winsA}
              <span className="mx-2 text-[var(--text-faint)]">–</span>
              {h2h.winsB}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Wins</span>
            {soccer && <span className="mt-1 text-xs text-[var(--text-muted)]">{h2h.draws} draws</span>}
          </div>
          <Link href={`/${league}/teams/${teamB.slug}`} className="flex flex-col items-center gap-2 text-center hover:text-[var(--accent)]">
            <TeamLogo name={teamDisplayName(teamB.name)} logoUrl={teamB.logo_url} color={teamB.color} size={64} />
            <span className="text-base font-bold sm:text-lg">{teamDisplayName(teamB.name)}</span>
          </Link>
        </div>
        {h2h.meetings > 0 && (
          <div className="px-4 pb-4 sm:px-8">
            <div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]" aria-hidden="true">
              <span className="h-full" style={{ width: `${pctA}%`, background: teamA.color ?? "var(--accent)" }} />
              <span className="h-full bg-[var(--draw)]" style={{ width: `${pctD}%` }} />
              <span className="h-full flex-1" style={{ background: teamB.color ?? "var(--accent-2)" }} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 divide-x divide-[var(--border)] border-t border-[var(--border)] sm:grid-cols-4">
          <Stat label="Meetings" value={h2h.meetings} sub={h2h.firstSeason ? `since ${formatSeasonLabel(league, h2h.firstSeason)}` : undefined} />
          <Stat label={`${scoreWord} for ${teamA.abbreviation ?? teamDisplayName(teamA.name)}`} value={h2h.goalsA} sub={h2h.meetings ? `${(h2h.goalsA / total).toFixed(1)} per game` : undefined} />
          <Stat label={`${scoreWord} for ${teamB.abbreviation ?? teamDisplayName(teamB.name)}`} value={h2h.goalsB} sub={h2h.meetings ? `${(h2h.goalsB / total).toFixed(1)} per game` : undefined} />
          <Stat label="Current run" value={h2h.streak && h2h.streak.length > 1 ? h2h.streak.length : "—"} sub={streakText ?? undefined} />
        </div>
      </section>

      <AdSlot label="Head-to-head top" />

      {h2h.upcoming && (
        <section>
          <SectionHeader>Next meeting</SectionHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <GameCard league={league} game={h2h.upcoming} />
          </div>
        </section>
      )}

      {(h2h.biggestWinA || h2h.biggestWinB) && (
        <section>
          <SectionHeader>Biggest wins</SectionHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {h2h.biggestWinA && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--text-muted)]">{teamDisplayName(teamA.name)}</p>
                <GameCard league={league} game={h2h.biggestWinA} />
              </div>
            )}
            {h2h.biggestWinB && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--text-muted)]">{teamDisplayName(teamB.name)}</p>
                <GameCard league={league} game={h2h.biggestWinB} />
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <SectionHeader description={`Every ${LEAGUE_LABEL[league]} meeting on record, most recent first`}>All meetings</SectionHeader>
        {h2h.games.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">These two teams haven&apos;t met in our archive yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {h2h.games.map((g) => (
              <GameCard key={g.espn_id} league={league} game={g} />
            ))}
          </div>
        )}
      </section>

      <RelatedLinks
        groups={[
          { title: `More ${teamDisplayName(teamA.name)} head-to-heads`, links: rivalLinks(teamA, teamB, rivalsA) },
          { title: `More ${teamDisplayName(teamB.name)} head-to-heads`, links: rivalLinks(teamB, teamA, rivalsB) },
          {
            title: "Teams",
            links: [
              { href: `/${league}/teams/${teamA.slug}`, label: teamDisplayName(teamA.name), sub: "Schedule, results and roster", image: teamA.logo_url, imageName: teamDisplayName(teamA.name) },
              { href: `/${league}/teams/${teamB.slug}`, label: teamDisplayName(teamB.name), sub: "Schedule, results and roster", image: teamB.logo_url, imageName: teamDisplayName(teamB.name) },
              { href: `/${league}/compare?a=${teamA.slug}&b=${teamB.slug}`, label: "Compare the two teams", sub: "Season stats side by side" },
            ],
          },
        ]}
      />
    </div>
  );
}
