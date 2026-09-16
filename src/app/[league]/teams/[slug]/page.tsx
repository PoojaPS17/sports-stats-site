import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, getTeamBySlug, getTeamGamesBySeason, getTeamSeasons, getTeamRoster } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamSeasonGames } from "@/components/TeamSeasonGames";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamPageNav } from "@/components/TeamPageNav";

export const revalidate = 300;

export default async function TeamPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const team = await getTeamBySlug(league, slug);
  if (!team) notFound();

  const seasons = await getTeamSeasons(league, team.espn_id);
  const activeSeason = seasons[0] ?? null;
  const [games, roster] = await Promise.all([
    activeSeason ? getTeamGamesBySeason(league, team.espn_id, activeSeason) : Promise.resolve([]),
    getTeamRoster(league, team.espn_id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <TeamHeader league={league} name={team.name} logoUrl={team.logo_url} color={team.color} />

      <TeamPageNav basePath={`/${league}/teams/${slug}`} active="overview" />

      <AdSlot label="Team page top" />

      <TeamSeasonGames
        league={league}
        games={games}
        seasons={seasons}
        activeSeason={activeSeason}
        basePath={`/${league}/teams/${slug}`}
      />

      <section>
        <SectionHeader>Current Roster</SectionHeader>
        {roster.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No roster data yet.</p>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 pl-4 font-medium">Player</th>
                  <th className="py-2 font-medium">Pos</th>
                  <th className="py-2 font-medium">No.</th>
                  <th className="py-2 font-medium">Height</th>
                  <th className="py-2 font-medium">Weight</th>
                  <th className="py-2 pr-4 font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.espn_id} className="border-t border-[var(--border)] transition hover:bg-[var(--surface-muted)]">
                    <td className="py-2 pl-4">
                      <Link href={`/${league}/players/${p.slug}`} className="flex items-center gap-2.5 font-medium hover:underline">
                        {p.headshot_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.headshot_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-full bg-[var(--surface-muted)]" />
                        )}
                        <span>
                          {p.name}
                          {p.is_captain && <span className="pill pill-feature ml-2 align-middle">C</span>}
                          {p.is_wicketkeeper && <span className="pill pill-upcoming ml-1 align-middle">WK</span>}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2 text-[var(--text-muted)]">{p.position ?? "—"}</td>
                    <td className="py-2 tabular-nums text-[var(--text-muted)]">{p.jersey ?? "—"}</td>
                    <td className="py-2 text-[var(--text-muted)]">{p.height ?? "—"}</td>
                    <td className="py-2 text-[var(--text-muted)]">{p.weight ?? "—"}</td>
                    <td className="py-2 pr-4 tabular-nums text-[var(--text-muted)]">{p.age ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
