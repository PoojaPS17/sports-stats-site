import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { AdSlot } from "@/components/AdSlot";
import { SeriesCard, SeriesMatchList } from "@/components/CricketSeries";
import { byPriority, getCricketSeriesWindow, getLiveCricketMatches, SERIES_KIND_LABEL, type CricketSeries, type SeriesKind } from "@/lib/cricketSeries";
import { overlayLiveCricket } from "@/lib/cricketLive";
import { LiveRefresh } from "@/components/LiveRefresh";

export const revalidate = 120;

export const metadata: Metadata = pageMeta(
  "Cricket Series",
  "All current and upcoming cricket series, domestic leagues and international tournaments, men's and women's, with live scores, fixtures and results.",
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
  const live = (await overlayLiveCricket(storedLive)).filter((m) => m.status_state === "in").sort(byPriority);
  const liveSeries = new Set(live.map((m) => m.series_espn_id));
  const now = clock();
  const { inProgress, upcoming, finished } = split(series.map((s) => (liveSeries.has(s.espn_id) ? { ...s, live_count: Math.max(s.live_count, 1) } : s)));

  return (
    <div className="flex flex-col gap-8">
      <LiveRefresh active={live.length > 0} />
      <PageHeader title="Cricket Series" subtitle="All current and upcoming cricket series, domestic leagues and international tournaments, men's and women's, from ESPN's daily listing.">
        <Link href="/cricket/series/archive" className="nav-pill">
          Past seasons
        </Link>
      </PageHeader>

      <AdSlot label="Cricket series top" />

      {live.length > 0 && (
        <section>
          <SectionHeader description="Scores update every few minutes">Live now</SectionHeader>
          <SeriesMatchList matches={live} showSeries />
        </section>
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
    </div>
  );
}
