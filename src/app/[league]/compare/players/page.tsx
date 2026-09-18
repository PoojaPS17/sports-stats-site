import type { Metadata } from "next";
import { teamDisplayName } from "@/lib/teamName";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLeague, LEAGUE_LABEL, formatSeasonLabel } from "@/lib/queries";
import { getPlayerComparison, getPlayerLabel, type PlayerCompareSide } from "@/lib/compare";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { PageHeader } from "@/components/PageHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { CompareTable } from "@/components/CompareTable";
import { CompareModeTabs } from "@/components/CompareModeTabs";
import { PlayerPicker } from "@/components/PlayerPicker";

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
    const cmp = await getPlayerComparison(league, a, b);
    if (cmp) {
      return pageMeta(`${cmp.a.player.name} vs ${cmp.b.player.name}`, `${cmp.a.player.name} and ${cmp.b.player.name} ${label} stats compared side by side, category by category.`, `/${league}/compare/players`);
    }
  }
  return pageMeta(`Compare ${label} Players`, `Pick any two ${label} players and compare their season statistics side by side.`, `/${league}/compare/players`);
}

function PlayerCard({ league, side }: { league: string; side: PlayerCompareSide }) {
  const p = side.player;
  const facts = [p.position, p.jersey ? `#${p.jersey}` : null, p.age ? `${p.age} yrs` : null, p.height].filter(Boolean).join(" · ");
  return (
    <Link href={`/${league}/players/${p.slug}`} className="card flex items-center gap-3 px-4 py-3" style={{ borderTop: `3px solid ${p.team_color ?? "var(--accent)"}` }}>
      {p.headshot_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.headshot_url} alt="" className="h-12 w-12 shrink-0 rounded-full bg-[var(--surface-muted)] object-cover" />
      ) : (
        <TeamLogo name={p.name} logoUrl={null} color={p.team_color} size={48} />
      )}
      <span className="min-w-0">
        <span className="block truncate text-base font-bold">{p.name}</span>
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          {p.team_logo && <TeamLogo name={p.team_name ?? ""} logoUrl={p.team_logo} color={p.team_color} size={14} />}
          <span className="truncate">{teamDisplayName(p.team_name) ?? "Free agent"}</span>
        </span>
        {facts && <span className="block text-xs text-[var(--text-faint)]">{facts}</span>}
      </span>
    </Link>
  );
}

export default async function ComparePlayersPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { league } = await params;
  if (!isLeague(league)) notFound();
  const { a = "", b = "" } = await searchParams;
  const label = LEAGUE_LABEL[league];

  const cmp = a && b && a !== b ? await getPlayerComparison(league, a, b) : null;
  const [initialA, initialB] = cmp
    ? [{ slug: cmp.a.player.slug, name: cmp.a.player.name }, { slug: cmp.b.player.slug, name: cmp.b.player.name }]
    : await Promise.all([a ? getPlayerLabel(league, a) : null, b ? getPlayerLabel(league, b) : null]);
  const seasonNote = cmp
    ? cmp.a.season && cmp.b.season
      ? cmp.a.season === cmp.b.season
        ? `${formatSeasonLabel(league, cmp.a.season)} season totals`
        : `Latest season for each: ${formatSeasonLabel(league, cmp.a.season)} vs ${formatSeasonLabel(league, cmp.b.season)}`
      : "Career figures on record"
    : "Pick any two players to see their stats side by side";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={cmp ? `${cmp.a.player.name} vs ${cmp.b.player.name}` : `Compare ${label} Players`} subtitle={seasonNote}>
        <CompareModeTabs league={league} active="players" />
      </PageHeader>

      <form method="get" action={`/${league}/compare/players`} className="card flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-end">
        <PlayerPicker league={league} name="a" label="Player A" initial={initialA} />
        <span className="hidden pb-2 text-sm font-bold text-[var(--text-faint)] sm:block">vs</span>
        <PlayerPicker league={league} name="b" label="Player B" initial={initialB} />
        <button type="submit" className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]">
          Compare
        </button>
      </form>

      <AdSlot label={`${label} compare players top`} />

      {a && b && !cmp && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Choose two different {label} players to compare.</p>}

      {cmp && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <PlayerCard league={league} side={cmp.a} />
            <PlayerCard league={league} side={cmp.b} />
          </div>
          {cmp.groups.length === 0 ? (
            <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No season stats on record for one or both players yet.</p>
          ) : (
            <CompareTable
              groups={cmp.groups}
              colorA={cmp.a.player.team_color}
              colorB={cmp.b.player.team_color}
              nameA={cmp.a.player.name.split(" ").slice(-1)[0]}
              nameB={cmp.b.player.name.split(" ").slice(-1)[0]}
            />
          )}
          <p className="text-xs text-[var(--text-faint)]">Bold marks the better figure for each stat. For stats like interceptions thrown, fouls or turnovers, lower is treated as better.</p>
        </>
      )}
    </div>
  );
}
