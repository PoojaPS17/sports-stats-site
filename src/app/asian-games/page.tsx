import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { currentEdition, isGamesOpen } from "@/lib/asianGamesEditions";
import { isAsianGamesCricket } from "@/lib/cricketFeatured";
import { getUpcomingCricketMatches, getLiveCricketMatches } from "@/lib/cricketSeries";
import { SeriesMatchList } from "@/components/CricketSeries";
import { SectionHeader } from "@/components/SectionHeader";
import { AdSlot } from "@/components/AdSlot";

export const metadata = pageMeta(
  "Asian Games",
  "Asian Games schedule, live cricket matches and the medal tally, 1951-2026.",
  "/asian-games"
);

export const revalidate = 300;

export default async function AsianGamesPage() {
  const edition = currentEdition();
  const open = isGamesOpen(edition);

  const [liveAll, upcomingAll] = await Promise.all([
    getLiveCricketMatches(false, "asian games"),
    getUpcomingCricketMatches(100, 20, false, "asian games"),
  ]);
  const liveCricket = liveAll.filter(isAsianGamesCricket);
  const liveIds = new Set(liveCricket.map((m) => m.espn_id));
  const upcomingCricket = upcomingAll.filter((m) => isAsianGamesCricket(m) && !liveIds.has(m.espn_id));

  return (
    <div className="flex flex-col gap-6">
      <div className="card px-4 py-4">
        <h1 className="page-title">{edition.hostCity} {edition.year}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {edition.hostCity}, {edition.hostCountry} &middot; {edition.startDate} to {edition.endDate}
          {open && <span className="ml-2 rounded-full bg-[var(--live)] px-2 py-0.5 text-xs font-bold text-white">LIVE</span>}
        </p>
        <Link href="/asian-games/medal-tally" className="mt-3 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
          View the medal tally &rarr;
        </Link>
      </div>

      <AdSlot label="Asian Games top" />

      <section>
        <SectionHeader
          action={{ label: "All cricket", href: "/cricket/series" }}
          description="The Asian Games sports this site covers live. Every other sport is on the medal tally only — see the medal tally page for why."
        >
          Cricket
        </SectionHeader>
        {liveCricket.length > 0 && (
          <>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Live now</p>
            <SeriesMatchList matches={liveCricket} showSeries />
          </>
        )}
        {upcomingCricket.length > 0 ? (
          <>
            <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Upcoming</p>
            <SeriesMatchList matches={upcomingCricket} showSeries />
          </>
        ) : (
          liveCricket.length === 0 && <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No Asian Games cricket fixtures on record right now.</p>
        )}
      </section>
    </div>
  );
}
