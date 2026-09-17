import { notFound } from "next/navigation";
import Link from "next/link";
import { isTour, getTennisRankings, TOUR_LABEL } from "@/lib/tennis";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 3600;

export default async function TennisRankingsPage({ params }: { params: Promise<{ tour: string }> }) {
  const { tour } = await params;
  if (!isTour(tour)) notFound();

  const rankings = await getTennisRankings(tour);

  return (
    <div className="flex flex-col gap-6">
      <nav className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto border-b border-[var(--border)] px-4 py-2.5 sm:mx-0 sm:px-0">
        <Link href={`/tennis/${tour}`} className="nav-pill shrink-0 text-sm text-[var(--text-muted)]">
          Scores
        </Link>
        <Link href={`/tennis/${tour}/rankings`} className="nav-pill nav-pill-active shrink-0 text-sm">
          Rankings
        </Link>
      </nav>

      <h1 className="text-2xl font-extrabold tracking-tight">{TOUR_LABEL[tour]} Rankings</h1>

      <AdSlot label={`${TOUR_LABEL[tour]} rankings top`} />

      {rankings.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No rankings on record yet.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 pl-4 font-medium">Rank</th>
                <th className="px-2 py-2 font-medium">Player</th>
                <th className="px-2 py-2 text-right font-medium">Points</th>
                <th className="py-2 pr-4 text-right font-medium">Prev.</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => {
                const movement = r.previous_rank !== null ? r.previous_rank - r.rank : 0;
                return (
                  <tr key={r.player_espn_id} className="border-t border-[var(--border)] transition hover:bg-[var(--surface-muted)]">
                    <td className="py-2 pl-4 font-bold tabular-nums">{r.rank}</td>
                    <td className="px-2 py-2">
                      <Link href={`/tennis/${tour}/players/${r.slug}`} className="flex items-center gap-2.5 font-medium hover:underline">
                        {r.headshot_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.headshot_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <span className="h-7 w-7 shrink-0 rounded-full bg-[var(--surface-muted)]" />
                        )}
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{r.points ?? "-"}</td>
                    <td className="py-2 pr-4 text-right text-xs tabular-nums text-[var(--text-muted)]">
                      {movement > 0 ? `▲${movement}` : movement < 0 ? `▼${Math.abs(movement)}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
