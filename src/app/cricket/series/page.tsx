import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { AdSlot } from "@/components/AdSlot";
import { SeriesCard, SeriesMatchList } from "@/components/CricketSeries";
import { CricketSeriesPicker } from "@/components/CricketSeriesPicker";
import { byPriority, getCricketSeriesWindow, getLiveCricketMatches, SERIES_KIND_LABEL, type CricketSeries, type SeriesKind } from "@/lib/cricketSeries";
import { isFeaturedCricket } from "@/lib/cricketFeatured";
import { overlayLiveCricket } from "@/lib/cricketLive";
import { LiveRefresh } from "@/components/LiveRefresh";

export const revalidate = 15;

export const metadata: Metadata = pageMeta(
  "Cricket Series",
  "Live scores, fixtures and results for international cricket, the World Cups, the IPL and the other big T20 leagues, men's and women's, plus every other series and tournament by search.",
  "/cricket/series"
);

// Wall-clock read kept out of the render body (the purity lint), as a plain call.
function clock(): number {
  return Date.now();
}

const KIND_ORDER: SeriesKind[] = ["international", "womens-international", "domestic", "womens-domestic", "other"];

function split(series: CricketSeries[]) {
  const now = clock();
  const inProgress: CricketSeries[] = [];
  const upcoming: CricketSeries[] = [];
  const finished: CricketSeries[] = [];
  for (const s of series) {
    const start = s.start_date ? new Date(s.start_date).getTime() : 0;
    const end = s.end_date ? new Date(s.end_date).getTime() + 86_400_000 : 0;
    if (s.live_count > 0 || (start <= now && end >= now)) inProgress.push(s);
    else if (start > now) upcoming.push(s);
    else finished.push(s);
  }
  return { inProgress, upcoming, finished };
}

function ByKind({ series, now }: { series: CricketSeries[]; now: number }) {
  return (
    <div className="flex flex-col gap-5">
      {KIND_ORDER.map((kind) => {
        const items = series.filter((s) => s.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind}>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{SERIES_KIND_LABEL[kind]}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((s) => (
                <SeriesCard key={s.espn_id} s={s} now={now} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function CricketSeriesPage() {
  const [series, storedLive] = await Promise.all([getCricketSeriesWindow(14, 60), getLiveCricketMatches()]);
  // ESPN's current state over the stored rows: a match that started since the last
  // scrape appears, a stale score is replaced, a finished one drops off.
  const liveAll = (await overlayLiveCricket(storedLive)).filter((m) => m.status_state === "in").sort(byPriority);
  // Headline cricket only in the lists (see lib/cricketFeatured.ts); the rest of the
  // sport sits under "Other competitions" and behind the picker.
  const live = liveAll.filter(isFeaturedCricket);
  const otherLive = liveAll.length - live.length;
  const liveSeries = new Set(liveAll.map((m) => m.series_espn_id));
  const now = clock();
  const withLive = series.map((s) => (liveSeries.has(s.espn_id) ? { ...s, live_count: Math.max(s.live_count, 1) } : s));
  const { inProgress, upcoming, finished } = split(withLive.filter((s) => s.featured));
  const other = withLive.filter((s) => !s.featured);
  // Anything in play first, then by kind and start date as the cards are grouped.
  const otherOrdered = [...split(other).inProgress, ...split(other).upcoming, ...split(other).finished];

  return (
    <div className="flex flex-col gap-8">
      <LiveRefresh active={liveAll.length > 0} />
      <PageHeader
        title="Cricket Series"
        subtitle="Internationals, the World Cups, the IPL and the other big T20 leagues, men's and women's. Every other series and tournament ESPN lists is a search away."
      >
        <Link href="/cricket/series/archive" className="nav-pill">
          Past seasons
        </Link>
      </PageHeader>

      <div className="max-w-2xl">
        <CricketSeriesPicker large />
      </div>

      <AdSlot label="Cricket series top" />

      {live.length > 0 && (
        <section>
          <SectionHeader description="Scores refresh every 10 seconds">Live now</SectionHeader>
          <SeriesMatchList matches={live} showSeries />
        </section>
      )}
      {otherLive > 0 && (
        <p className={`text-sm text-[var(--text-muted)] ${live.length > 0 ? "-mt-5" : ""}`}>
          {live.length === 0 ? "No headline cricket in play right now. " : ""}
          {otherLive} more match{otherLive === 1 ? "" : "es"} in play in{" "}
          <a href="#other-competitions" className="font-semibold text-[var(--accent)] hover:underline">
            other competitions
          </a>
          .
        </p>
      )}

      <section>
        <SectionHeader description={`${inProgress.length} series with play in progress`}>In progress</SectionHeader>
        {inProgress.length === 0 ? <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">Nothing in progress today.</p> : <ByKind series={inProgress} now={now} />}
      </section>

      <section>
        <SectionHeader description="Starting in the next 60 days">Upcoming</SectionHeader>
        {upcoming.length === 0 ? <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No upcoming series listed yet.</p> : <ByKind series={upcoming} now={now} />}
      </section>

      {finished.length > 0 && (
        <section>
          <SectionHeader description="Finished in the last two weeks">Recently completed</SectionHeader>
          <ByKind series={finished} now={now} />
        </section>
      )}

      {other.length > 0 && (
        <section id="other-competitions">
          <SectionHeader description="Domestic first-class and one-day cups, club T20s, youth and A-team tours: stored in full, shown on request">
            Other competitions
          </SectionHeader>
          <details className="card group px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--accent)] marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">
                Show {other.length} series in progress, upcoming or just finished{otherLive > 0 ? `, ${otherLive} match${otherLive === 1 ? "" : "es"} live` : ""} →
              </span>
              <span className="hidden group-open:inline">Hide other competitions</span>
            </summary>
            <div className="mt-4">
              <ByKind series={otherOrdered} now={now} />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
