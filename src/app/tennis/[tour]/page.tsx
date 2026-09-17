import { notFound } from "next/navigation";
import Link from "next/link";
import { isTour, getTennisMatches, TOUR_LABEL } from "@/lib/tennis";
import { AdSlot } from "@/components/AdSlot";
import { TennisMatchCard } from "@/components/TennisMatchCard";

export const revalidate = 300;

export default async function TennisScoresPage({ params }: { params: Promise<{ tour: string }> }) {
  const { tour } = await params;
  if (!isTour(tour)) notFound();

  const matches = await getTennisMatches(tour);

  return (
    <div className="flex flex-col gap-6">
      <nav className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto border-b border-[var(--border)] px-4 py-2.5 sm:mx-0 sm:px-0">
        <Link href={`/tennis/${tour}`} className="nav-pill nav-pill-active shrink-0 text-sm">
          Scores
        </Link>
        <Link href={`/tennis/${tour}/rankings`} className="nav-pill shrink-0 text-sm text-[var(--text-muted)]">
          Rankings
        </Link>
      </nav>

      <h1 className="text-2xl font-extrabold tracking-tight">{TOUR_LABEL[tour]} Scores</h1>

      <AdSlot label={`${TOUR_LABEL[tour]} top`} />

      {matches.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No matches in range right now.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {matches.map((m) => (
            <TennisMatchCard key={m.espn_id} tour={tour} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
