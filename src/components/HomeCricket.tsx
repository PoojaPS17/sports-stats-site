import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { SeriesMatchList } from "@/components/CricketSeries";
import { byPriority, getLiveCricketMatches, getUpcomingCricketMatches } from "@/lib/cricketSeries";
import { overlayLiveCricket } from "@/lib/cricketLive";

// The home page's cricket block: not one competition but the whole sport, the way
// the Series directory sees it. Matches in play are in the page's Live now section;
// this block carries the next fixtures across every series and a count of the live ones.
export async function HomeCricket() {
  const [storedLive, upcoming] = await Promise.all([getLiveCricketMatches(), getUpcomingCricketMatches(8)]);
  const live = (await overlayLiveCricket(storedLive)).filter((m) => m.status_state === "in");
  const liveIds = new Set(live.map((m) => m.espn_id));
  const next = upcoming
    .filter((m) => !liveIds.has(m.espn_id))
    .sort(byPriority)
    .slice(0, 4);

  return (
    <section className="sm:col-span-2">
      <SectionHeader
        action={{ label: "All series", href: "/cricket/series" }}
        description={live.length > 0 ? `${live.length} match${live.length === 1 ? "" : "es"} in play, listed under Live now above` : "Every series, league and tournament, men's and women's"}
      >
        Cricket
      </SectionHeader>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Upcoming</p>
        {next.length > 0 ? <SeriesMatchList matches={next} showSeries /> : <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">No fixtures listed for the next week.</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/cricket/series" className="text-[var(--accent)] hover:underline">
          Series &amp; tournaments
        </Link>
        <Link href="/ipl" className="text-[var(--accent)] hover:underline">
          IPL
        </Link>
        <Link href="/odi" className="text-[var(--accent)] hover:underline">
          ODIs
        </Link>
        <Link href="/t20i" className="text-[var(--accent)] hover:underline">
          T20Is
        </Link>
        <Link href="/odi/leaders" className="text-[var(--accent)] hover:underline">
          Leaders
        </Link>
      </div>
    </section>
  );
}
