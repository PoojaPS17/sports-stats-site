import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import { AdSlot } from "@/components/AdSlot";
import { TennisDayStrip, TennisDayView, formatDayLabel } from "@/components/TennisScores";
import { getTennisDay, getTennisDaysAround } from "@/lib/tennis";
import { overlayLiveTennis } from "@/lib/tennisLive";
import { LiveRefresh } from "@/components/LiveRefresh";

export const revalidate = 120;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  if (!DATE_RE.test(date)) return {};
  return pageMeta(`Tennis Scores, ${formatDayLabel(date)}`, `Every ATP and WTA match played on ${formatDayLabel(date)}: set-by-set scores, rounds and courts, tournament by tournament.`, `/tennis/scores/${date}`);
}

export default async function TennisDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!DATE_RE.test(date) || Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())) notFound();

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
      <TennisDayView matches={matches} emptyText="No matches on file for this day. ESPN's listing covers tour-level and Challenger events from 2016 onward." />
    </div>
  );
}
