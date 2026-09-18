import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { SeriesMatchList } from "@/components/CricketSeries";
import { LiveRefresh } from "@/components/LiveRefresh";
import { byPriority, getLiveCricketMatches, getUpcomingCricketMatches } from "@/lib/cricketSeries";
import { overlayLiveCricket } from "@/lib/cricketLive";

// The home page's cricket block: not one competition but the whole sport, the way
// the Series directory sees it. Live matches from ESPN's current state, then the
// next fixtures across every series.
export async function HomeCricket() {
  const [storedLive, upcoming] = await Promise.all([getLiveCricketMatches(), getUpcomingCricketMatches(6)]);
  const live = (await overlayLiveCricket(storedLive)).filter((m) => m.status_state === "in").sort(byPriority);
  const liveIds = new Set(live.map((m) => m.espn_id));
  const next = upcoming
    .filter((m) => !liveIds.has(m.espn_id))
    .sort(byPriority)
    .slice(0, live.length > 0 ? 3 : 4);

  return (
    <section className="sm:col-span-2">
      <LiveRefresh active={live.length > 0} />
      <SectionHeader action={{ label: "All series", href: "/cricket/series" }}>Cricket</SectionHeader>
      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            {live.length > 0 && <span className="pill pill-live">Live</span>}
            Live now
            {live.length > 0 && <span className="font-semibold normal-case tracking-normal text-[var(--text-faint)]">{live.length} match{live.length === 1 ? "" : "es"} in play, scores every 30 seconds</span>}
          </p>
          {live.length > 0 ? <SeriesMatchList matches={live.slice(0, 6)} showSeries /> : <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">No cricket in play right now.</p>}
          {live.length > 6 && (
            <Link href="/cricket/series" className="mt-2 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
              All {live.length} live matches →
            </Link>
          )}
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Upcoming</p>
          {next.length > 0 ? <SeriesMatchList matches={next} showSeries /> : <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">No fixtures listed for the next week.</p>}
        </div>
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
