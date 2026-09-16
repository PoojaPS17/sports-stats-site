import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getStandings } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 300;

export default async function StandingsPage({ params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  if (!isLeague(league)) notFound();

  const standings = await getStandings(league);
  const byConference = new Map<string, typeof standings>();
  for (const row of standings) {
    const key = row.conference ?? "All Teams";
    if (!byConference.has(key)) byConference.set(key, []);
    byConference.get(key)!.push(row);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{LEAGUE_LABEL[league]} Standings</h1>
      <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />

      <div className="grid gap-6 lg:grid-cols-2">
        {[...byConference.entries()].map(([conference, rows]) => (
          <section key={conference} className="card overflow-hidden">
            <h2 className="border-b border-[var(--border)] bg-[var(--surface-muted)] px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {conference}
            </h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th className="py-2 pl-4 font-medium">Team</th>
                  <th className="py-2 text-right font-medium">W</th>
                  <th className="py-2 text-right font-medium">L</th>
                  <th className="py-2 text-right font-medium">PCT</th>
                  <th className="py-2 pr-4 text-right font-medium">Streak</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.team_espn_id}
                    className="border-t border-[var(--border)] transition hover:bg-[var(--surface-muted)]"
                  >
                    <td className="py-2 pl-4">
                      <Link href={`/${league}/teams/${r.slug}`} className="flex items-center gap-2.5 font-medium">
                        <span className="w-4 text-xs text-[var(--text-muted)]">{i + 1}</span>
                        <TeamLogo name={r.name} logoUrl={r.logo_url} color={r.color} size={22} />
                        {r.name}
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.wins}</td>
                    <td className="py-2 text-right tabular-nums">{r.losses}</td>
                    <td className="py-2 text-right tabular-nums text-[var(--text-muted)]">{Number(r.win_percent).toFixed(3)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-[var(--text-muted)]">{r.streak ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
