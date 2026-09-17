import { notFound } from "next/navigation";
import Link from "next/link";
import { isTour, getTennisPlayerBySlug, getTennisPlayerMatches, getTennisPlayerRanking, TOUR_LABEL } from "@/lib/tennis";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { TennisMatchCard } from "@/components/TennisMatchCard";

export const revalidate = 300;

export default async function TennisPlayerPage({
  params,
}: {
  params: Promise<{ tour: string; slug: string }>;
}) {
  const { tour, slug } = await params;
  if (!isTour(tour)) notFound();

  const player = await getTennisPlayerBySlug(tour, slug);
  if (!player) notFound();

  const [matches, ranking] = await Promise.all([
    getTennisPlayerMatches(tour, player.espn_id),
    getTennisPlayerRanking(tour, player.espn_id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex items-center gap-4 overflow-hidden px-6 py-6">
        {player.headshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.headshot_url} alt={player.name} width={72} height={72} className="rounded-full border-2 border-[var(--surface)] bg-[var(--surface-muted)] object-cover" />
        ) : (
          <span className="h-[72px] w-[72px] shrink-0 rounded-full bg-[var(--surface-muted)]" />
        )}
        <div>
          <h1 className="page-title">{player.name}</h1>
          <p className="text-sm font-medium text-[var(--text-muted)]">
            {TOUR_LABEL[tour]}
            {ranking ? ` · Ranked #${ranking.rank}${ranking.points ? ` · ${ranking.points} pts` : ""}` : ""}
          </p>
        </div>
      </div>

      <AdSlot label="Tennis player top" />

      <section>
        <SectionHeader>Recent Matches</SectionHeader>
        {matches.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No matches recorded yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((m) => (
              <TennisMatchCard key={m.espn_id} tour={tour} match={m} />
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-[var(--text-muted)]">
        <Link href={`/tennis/${tour}/rankings`} className="text-[var(--accent)] hover:underline">
          View full {TOUR_LABEL[tour]} rankings →
        </Link>
      </p>
    </div>
  );
}
