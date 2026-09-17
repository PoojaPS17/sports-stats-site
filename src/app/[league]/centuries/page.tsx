import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, isCricketLeague, getCricketCenturies, LEAGUE_LABEL } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueSubNav } from "@/components/LeagueSubNav";

export const revalidate = 3600;

export default async function CenturiesPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league) || !isCricketLeague(league)) notFound();

  const centuries = await getCricketCenturies(league);

  return (
    <div className="flex flex-col gap-6">
      <LeagueSubNav league={league} />

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} Centuries</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Every century scored in the {LEAGUE_LABEL[league]} on record ({centuries.length} total) — most recent first.
        </p>
      </div>

      <AdSlot label={`${LEAGUE_LABEL[league]} centuries top`} />

      {centuries.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No centuries on record yet.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 pl-4 font-medium">Player</th>
                <th className="px-2 py-2 font-medium">Team</th>
                <th className="px-2 py-2 text-right font-medium">Runs</th>
                <th className="px-2 py-2 text-right font-medium">Balls</th>
                <th className="px-2 py-2 text-right font-medium">4s</th>
                <th className="px-2 py-2 text-right font-medium">6s</th>
                <th className="px-2 py-2 text-right font-medium">SR</th>
                <th className="px-2 py-2 font-medium">Opponent</th>
                <th className="px-2 py-2 font-medium">Venue</th>
                <th className="py-2 pr-4 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {centuries.map((c, i) => (
                <tr key={`${c.player_espn_id}-${c.date}-${i}`} className="border-t border-[var(--border)] transition hover:bg-[var(--surface-muted)]">
                  <td className="py-2 pl-4">
                    <Link href={`/${league}/players/${c.player_slug}`} className="flex items-center gap-2 font-medium hover:underline">
                      {c.headshot_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.headshot_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                      ) : (
                        <span className="h-6 w-6 shrink-0 rounded-full bg-[var(--surface-muted)]" />
                      )}
                      {c.player_name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/${league}/teams/${c.team_slug}`} className="flex items-center gap-1.5 text-[var(--text-muted)] hover:underline">
                      <TeamLogo name={c.team_name} logoUrl={c.team_logo} color={c.team_color} size={18} />
                      <span className="hidden sm:inline">{c.team_name}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-right font-bold tabular-nums">
                    {c.runs}
                    {c.not_out ? "*" : ""}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{c.balls_faced}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{c.fours}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">{c.sixes}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                    {c.balls_faced > 0 ? ((c.runs / c.balls_faced) * 100).toFixed(1) : "-"}
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/${league}/teams/${c.opponent_slug}`} className="text-[var(--text-muted)] hover:underline">
                      vs {c.opponent_name}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-[var(--text-muted)]">{c.venue ?? "-"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">
                    {new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
