import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getAllTeams, getStandings } from "@/lib/queries";
import { pageMeta } from "@/lib/metadata";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";

// Reads the current standings beside the club list, so it moves with the season.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ league: string }> }): Promise<Metadata> {
  const { league } = await params;
  if (!isLeague(league)) return {};
  const label = LEAGUE_LABEL[league];
  return pageMeta(`${label} Teams`, `Every ${label} team with schedules, results, rosters and season history.`, `/${league}/teams`);
}

export default async function TeamsIndexPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const [teams, standings] = await Promise.all([getAllTeams(league), getStandings(league)]);

  // The teams table holds every club that has appeared in our ten-year archive, so a
  // domestic league lists relegated and promoted sides too. Split them: teams in the
  // current standings are "this season", the rest are shown separately.
  const currentIds = new Set(standings.map((s) => s.team_espn_id));
  const hasCurrent = currentIds.size > 0 && currentIds.size < teams.length;
  const current = hasCurrent ? teams.filter((t) => currentIds.has(t.espn_id)) : teams;
  const former = hasCurrent ? teams.filter((t) => !currentIds.has(t.espn_id)) : [];

  const grid = (list: typeof teams) => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {list.map((t) => (
        <Link key={t.espn_id} href={`/${league}/teams/${t.slug}`} className="card flex items-center gap-3 px-4 py-3">
          <TeamLogo name={t.name} logoUrl={t.logo_url} color={t.color} size={30} />
          <span className="min-w-0 truncate text-sm font-semibold">{t.name}</span>
        </Link>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={`${LEAGUE_LABEL[league]} Teams`} subtitle={hasCurrent ? `${current.length} teams this season` : `${teams.length} teams`} />

      <AdSlot label={`${LEAGUE_LABEL[league]} teams top`} />

      {grid(current)}

      {former.length > 0 && (
        <section>
          <SectionHeader description="Clubs from past seasons in our archive">Other teams</SectionHeader>
          {grid(former)}
        </section>
      )}
    </div>
  );
}
