import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import { isTour, getTennisMatches, TOUR_LABEL } from "@/lib/tennis";
import { AdSlot } from "@/components/AdSlot";
import { TennisMatchCard } from "@/components/TennisMatchCard";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ tour: string }> }): Promise<Metadata> {
  const { tour } = await params;
  if (!isTour(tour)) return {};
  return pageMeta(`${TOUR_LABEL[tour]} Scores`, `Latest ${TOUR_LABEL[tour]} tennis results and upcoming matches from every tour event.`);
}

export default async function TennisScoresPage({ params }: { params: Promise<{ tour: string }> }) {
  const { tour } = await params;
  if (!isTour(tour)) notFound();

  const matches = await getTennisMatches(tour);

  return (
    <div className="flex flex-col gap-6">

      <PageHeader title={`${TOUR_LABEL[tour]} Scores`} subtitle="Recent results and upcoming matches" />

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
