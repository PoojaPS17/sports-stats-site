import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getAllTeams } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 3600;

export default async function TeamsIndexPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const teams = await getAllTeams(league);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} Teams</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">{teams.length} teams</p>
      </div>

      <AdSlot label={`${LEAGUE_LABEL[league]} teams top`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {teams.map((t) => (
          <Link
            key={t.espn_id}
            href={`/${league}/teams/${t.slug}`}
            className="card flex items-center gap-3 px-4 py-3 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <TeamLogo name={t.name} logoUrl={t.logo_url} color={t.color} size={32} />
            <span className="min-w-0 truncate text-sm font-semibold">{t.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
