import Link from "next/link";
import { LEAGUE_LABEL, formatSeasonLabel, type League } from "@/lib/queries";
import { breakLine } from "@/lib/breakLine";
import { GameCard } from "@/components/GameCard";
import { SectionHeader } from "@/components/SectionHeader";
import { LeagueSnapshot } from "@/components/LeagueSnapshot";
import type { HomeSection } from "@/lib/homeData";
import type { LeagueSnapshotData } from "@/lib/leagueSnapshot";

export function LeagueBlock({ section, snapshot }: { section: HomeSection; snapshot: LeagueSnapshotData | null | undefined }) {
  const { league, games, liveCount } = section;
  return (
    <section id={`scores-${league}`} data-scores-block={league} className="scroll-mt-[calc(var(--header-h)+1rem)]">
      <SectionHeader
        action={{ label: "All fixtures", href: `/${league}` }}
        badge={liveCount > 0 ? `${liveCount} live` : snapshot?.seasonLabel}
        description={liveCount > 0 ? `${liveCount} in play, listed under Live now above` : "Latest results and next fixtures"}
      >
        {LEAGUE_LABEL[league]}
      </SectionHeader>
      {games.length === 0 ? (
        <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">Everything this week is listed above.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {games.slice(0, 3).map((g) => (
            <GameCard key={g.espn_id} league={league} game={g} />
          ))}
        </div>
      )}
      {snapshot && (
        <div className="mt-5">
          <LeagueSnapshot league={league} data={snapshot} />
        </div>
      )}
      <div className="mt-3 flex gap-4 text-sm font-semibold">
        <Link href={`/${league}/standings`} className="text-[var(--accent)] hover:underline">Standings</Link>
        <Link href={`/${league}/leaders`} className="text-[var(--accent)] hover:underline">Leaders</Link>
        <Link href={`/${league}/teams`} className="text-[var(--accent)] hover:underline">Teams</Link>
      </div>
    </section>
  );
}

export function OffSeasonList({ items }: { items: { league: League; lastSeason: number | null; resumesOn: string | null }[] }) {
  if (items.length === 0) return null;
  return (
    <section id="scores-off-season" data-scores-block="off-season">
      <SectionHeader description="Nothing scheduled in the next few days">{items.every((s) => s.resumesOn === null) ? "Between seasons" : "Nothing on this week"}</SectionHeader>
      <ul className="card divide-y divide-[var(--border)] overflow-hidden">
        {items.map(({ league, lastSeason, resumesOn }) => (
          <li key={league} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
            <span>
              <span className="font-semibold">{LEAGUE_LABEL[league]}</span>
              <span className="text-[var(--text-muted)]"> · {breakLine(league, resumesOn)}</span>
            </span>
            <span className="flex gap-4 font-semibold text-[var(--accent)]">
              <Link href={lastSeason !== null ? `/${league}/standings/${lastSeason}` : `/${league}/standings`} className="hover:underline">
                {lastSeason !== null ? `${formatSeasonLabel(league, lastSeason)} standings` : "Standings"}
              </Link>
              <Link href={`/${league}/leaders`} className="hover:underline">Leaders</Link>
              <Link href={`/${league}`} className="hover:underline">Fixtures</Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
