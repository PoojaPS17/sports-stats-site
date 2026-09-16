import { notFound } from "next/navigation";
import Link from "next/link";
import { isLeague, LEAGUE_LABEL, getStandings } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";

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
      <h1 className="text-2xl font-bold">{LEAGUE_LABEL[league]} Standings</h1>
      <AdSlot label={`${LEAGUE_LABEL[league]} standings top`} />

      {[...byConference.entries()].map(([conference, rows]) => (
        <section key={conference}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">{conference}</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
                <th className="py-2 font-medium">Team</th>
                <th className="py-2 text-right font-medium">W</th>
                <th className="py-2 text-right font-medium">L</th>
                <th className="py-2 text-right font-medium">PCT</th>
                <th className="py-2 text-right font-medium">Streak</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.team_espn_id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2">
                    <Link href={`/${league}/teams/${r.slug}`} className="hover:underline">
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.wins}</td>
                  <td className="py-2 text-right tabular-nums">{r.losses}</td>
                  <td className="py-2 text-right tabular-nums">{Number(r.win_percent).toFixed(3)}</td>
                  <td className="py-2 text-right tabular-nums">{r.streak ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
