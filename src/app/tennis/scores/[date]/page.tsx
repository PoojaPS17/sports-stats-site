import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { isValidIsoDate } from "@/lib/isoDate";
import { PageHeader } from "@/components/PageHeader";
import { AdSlot } from "@/components/AdSlot";
import { TennisDayStrip, TennisDayView, formatDayLabel } from "@/components/TennisScores";
import { getTennisDay, getTennisDaysAround } from "@/lib/tennis";
import { overlayLiveTennis } from "@/lib/tennisLive";
import { LiveRefresh } from "@/components/LiveRefresh";
import { ImageActions } from "@/components/ImageActions";
import { TennisScoresExportCard } from "@/components/TennisExportCards";

export const revalidate = 15;

// Dynamic on purpose: no generateStaticParams here, so the day's scores is read fresh each time.
// It renders on every request and answers no-store: a cached render is up to 5 minutes old
// (expireTime in next.config.ts), and a render made in the pre state ships no LiveRefresh timer,
// so it would not catch up on its own. The window above still sets the default for the cached
// fetches inside this render.

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  if (!isValidIsoDate(date)) notFound();
  return pageMeta(`Tennis Scores, ${formatDayLabel(date)}`, `Every ATP and WTA match played on ${formatDayLabel(date)}: set-by-set scores, rounds and courts, tournament by tournament.`, `/tennis/scores/${date}`);
}

export default async function TennisDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidIsoDate(date)) notFound();

  const [stored, days] = await Promise.all([getTennisDay(date), getTennisDaysAround(date)]);
  const { matches, live } = await overlayLiveTennis(date, stored);

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh active={live} />
      <PageHeader title={formatDayLabel(date)} subtitle="Tennis scores from every tournament in play, grouped by tournament and draw. Times are in your local time zone.">
        <Link href="/tennis" className="nav-pill">
          Today
        </Link>
        <Link href="/tennis/tournaments" className="nav-pill">
          Calendar
        </Link>
      </PageHeader>
      <AdSlot label="Tennis day top" />
      <TennisDayStrip day={date} daysWithPlay={days} />
      {matches.length > 0 && (
        <ImageActions filename={`tennis-scores-${date}`} shareTitle={`Tennis scores, ${formatDayLabel(date)}`} width={820} card={<TennisScoresExportCard title="Tennis scores" subtitle={formatDayLabel(date)} matches={matches} />} />
      )}
      <TennisDayView matches={matches} emptyText="No matches on file for this day. Coverage is tour-level and Challenger events from 2016 onward." />
    </div>
  );
}
