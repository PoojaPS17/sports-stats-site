import { notFound } from "next/navigation";
import { isLeague, getTeamBySlug } from "@/lib/queries";
import { AdSlot } from "@/components/AdSlot";
import { TeamHeader } from "@/components/TeamHeader";
import { TeamPageNav } from "@/components/TeamPageNav";
import { SectionHeader } from "@/components/SectionHeader";

// Venue essentially never changes and head coach only changes a handful of times a
// decade — this can be cached far longer than the live scores/standings pages.
export const revalidate = 86400;

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-2.5 first:border-t-0">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

export default async function TeamAboutPage({
  params,
}: {
  params: Promise<{ league: string; slug: string }>;
}) {
  const { league, slug } = await params;
  if (!isLeague(league)) notFound();

  const team = await getTeamBySlug(league, slug);
  if (!team) notFound();

  const venueLocation = [team.venue_city, team.venue_state, team.venue_country].filter(Boolean).join(", ");
  const hasInfo = Boolean(team.venue_name || team.head_coach || team.abbreviation);

  return (
    <div className="flex flex-col gap-6">
      <TeamHeader league={league} name={team.name} logoUrl={team.logo_url} color={team.color} />

      <TeamPageNav basePath={`/${league}/teams/${slug}`} active="about" />

      <AdSlot label="Team page top" />

      <section>
        <SectionHeader>About {team.name}</SectionHeader>
        {!hasInfo ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
            Background info isn&apos;t available for this team from our data source yet.
          </p>
        ) : (
          <div className="card overflow-hidden">
            <InfoRow label="Head coach" value={team.head_coach} />
            <InfoRow label="Home venue" value={team.venue_name} />
            <InfoRow label="Location" value={venueLocation || null} />
            <InfoRow label="Abbreviation" value={team.abbreviation} />
          </div>
        )}
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Ownership information isn&apos;t available through our data source. We only show facts we can verify from a live feed.
        </p>
      </section>
    </div>
  );
}
