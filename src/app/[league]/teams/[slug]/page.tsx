import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getTeamBySlug, getTeamGames, getTeamRoster, formatSeasonLabel, type GameRow, type League } from "@/lib/queries";
import { GameCard } from "@/components/GameCard";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { SectionHeader } from "@/components/SectionHeader";

export const revalidate = 300;

function groupBySeason(league: League, games: GameRow[]): [string, GameRow[]][] {
  const groups = new Map<string, GameRow[]>();
  for (const g of games) {
    const key = formatSeasonLabel(league, g.season_year) ?? "Unknown season";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }
  // season_year descending — games within a season already arrive most-recent-first
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const team = await getTeamBySlug(league, slug);
  if (!team) notFound();

  const [games, roster] = await Promise.all([getTeamGames(league, team.espn_id), getTeamRoster(league, team.espn_id)]);
  const color = team.color ?? "var(--accent)";

  return (
    <div className="flex flex-col gap-6">
      <div
        className="card flex items-center gap-4 overflow-hidden px-6 py-6"
        style={{ background: `linear-gradient(135deg, ${color}1a, var(--surface))` }}
      >
        <TeamLogo name={team.name} logoUrl={team.logo_url} color={team.color} size={64} />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">{LEAGUE_LABEL[league]}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{team.name}</h1>
        </div>
      </div>

      <AdSlot label="Team page top" />

      <section className="flex flex-col gap-5">
        {games.length === 0 ? (
          <>
            <SectionHeader>Results &amp; Schedule</SectionHeader>
            <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No games found.</p>
          </>
        ) : (
          groupBySeason(league, games).map(([season, seasonGames]) => (
            <div key={season}>
              <SectionHeader>{season} Season</SectionHeader>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {seasonGames.map((g) => (
                  <GameCard key={g.espn_id} league={league} game={g} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>

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
