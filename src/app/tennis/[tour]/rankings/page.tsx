import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { isTour, getTennisRankings, getTennisRankingsAsOf, TOUR_LABEL } from "@/lib/tennis";
import { newerRankingNote, rankingLabel } from "@/lib/tennisRankings";
import { tennisToday } from "@/lib/tennisDates";
import { AdSlot } from "@/components/AdSlot";
import { Flag } from "@/components/TennisScores";
import { ImageActions } from "@/components/ImageActions";
import { TennisRankingsExportCard } from "@/components/TennisExportCards";

// The published ranking changes every Monday, and the tour's points move under it.
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ tour: string }> }): Promise<Metadata> {
  const { tour } = await params;
  if (!isTour(tour)) return {};
  return pageMeta(`${TOUR_LABEL[tour]} Rankings`, `Current ${TOUR_LABEL[tour]} world rankings with points and week-on-week movement.`, `/tennis/${tour}/rankings`);
}

export default async function TennisRankingsPage({ params }: { params: Promise<{ tour: string }> }) {
  const { tour } = await params;
  if (!isTour(tour)) notFound();

  const [rankings, { asOf }] = await Promise.all([getTennisRankings(tour), getTennisRankingsAsOf(tour)]);
  // Says which ranking this is; a week or more on, that it is dated and a newer one may have been published (never that one was: some Mondays have none).
  const subtitle = `${rankingLabel(asOf)}, with movement since the previous week`;
  const stale = newerRankingNote(asOf, tennisToday());

  return (
    <div className="flex flex-col gap-6">

      <PageHeader title={`${TOUR_LABEL[tour]} Rankings`} subtitle={subtitle} />

      <AdSlot label={`${TOUR_LABEL[tour]} rankings top`} />

      {rankings.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No rankings on record yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <ImageActions filename={`tennis-${tour}-rankings`} shareTitle={`${TOUR_LABEL[tour]} rankings`} width={640} card={<TennisRankingsExportCard tourLabel={TOUR_LABEL[tour]} title={`${TOUR_LABEL[tour]} rankings`} subtitle={subtitle} rankings={rankings} />} />
          {stale && <p className="text-xs text-[var(--text-muted)]">{stale}</p>}
          <div className="card overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="table-head text-left">
                  <th className="py-2 pl-4 font-medium">Rank</th>
                  <th className="px-2 py-2 font-medium">Player</th>
                  <th className="px-2 py-2 text-right font-medium">Points</th>
                  <th className="py-2 pr-4 text-right font-medium">Move</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((r) => {
                  const movement = r.previous_rank !== null ? r.previous_rank - r.rank : 0;
                  return (
                    <tr key={r.player_espn_id} className="table-row">
                      <td className="py-2 pl-4 font-bold tabular-nums">{r.rank}</td>
                      <td className="px-2 py-2">
                        <Link href={`/tennis/${tour}/players/${r.slug}`} className="flex items-center gap-2.5 font-medium hover:text-[var(--accent)]">
                          {r.headshot_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.headshot_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <span className="h-7 w-7 shrink-0 rounded-full bg-[var(--surface-muted)]" />
                          )}
                          <Flag code={r.country} />
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.points ?? "-"}</td>
                      <td className="py-2 pr-4 text-right text-xs tabular-nums text-[var(--text-muted)]">
                        {movement > 0 ? <span className="font-semibold text-[var(--win)]">▲{movement}</span> : movement < 0 ? <span className="font-semibold text-[var(--loss)]">▼{Math.abs(movement)}</span> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
