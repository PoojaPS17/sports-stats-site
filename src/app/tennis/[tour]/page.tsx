import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { AdSlot } from "@/components/AdSlot";
import { Flag, TennisDayStrip, TennisDayView, TournamentCard, formatDayLabel } from "@/components/TennisScores";
import { isTour, getTennisDay, getTennisDaysAround, getLatestTennisDay, getTennisRankings, getTennisTournamentsAround, TOUR_LABEL } from "@/lib/tennis";
import { overlayLiveTennis } from "@/lib/tennisLive";
import { LiveRefresh } from "@/components/LiveRefresh";

export const revalidate = 120;

export async function generateMetadata({ params }: { params: Promise<{ tour: string }> }): Promise<Metadata> {
  const { tour } = await params;
  if (!isTour(tour)) return {};
  return pageMeta(`${TOUR_LABEL[tour]} Scores`, `Today's ${TOUR_LABEL[tour]} tennis scores from every tournament in play, with set-by-set results, the order of play and the current rankings.`, `/tennis/${tour}`);
}

export default async function TennisTourPage({ params }: { params: Promise<{ tour: string }> }) {
  const { tour } = await params;
  if (!isTour(tour)) notFound();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [todayMatches, latest] = await Promise.all([getTennisDay(today, tour), getLatestTennisDay()]);
  const day = todayMatches.length > 0 ? today : (latest ?? today);
  const stored = day === today ? todayMatches : await getTennisDay(day, tour);
  const [{ matches, live }, days, tournaments, rankings] = await Promise.all([overlayLiveTennis(day, stored, tour), getTennisDaysAround(day), getTennisTournamentsAround(today), getTennisRankings(tour, 10)]);
  const tourTournaments = tournaments.filter((t) => t.tour === tour || t.tour === "both");

  return (
    <div className="flex flex-col gap-8">
      <LiveRefresh active={live} />
      <PageHeader title={`${TOUR_LABEL[tour]} Scores`} subtitle={`${TOUR_LABEL[tour]} matches day by day, from every tournament ESPN lists, with set scores, seeds and courts.`}>
        <Link href="/tennis" className="nav-pill">
          All tennis
        </Link>
        <Link href={`/tennis/${tour}/rankings`} className="nav-pill">
          Rankings
        </Link>
      </PageHeader>

      <AdSlot label={`${TOUR_LABEL[tour]} top`} />

      <section className="flex flex-col gap-3">
        <SectionHeader description={day === today ? "Today's play" : "The most recent day with results"} action={{ label: "All tours", href: `/tennis/scores/${day}` }}>
          {formatDayLabel(day)}
        </SectionHeader>
        <TennisDayStrip day={day} daysWithPlay={days} />
        <TennisDayView matches={matches} emptyText={`No ${TOUR_LABEL[tour]} matches on file for this day.`} />
      </section>

      {tourTournaments.length > 0 && (
        <section>
          <SectionHeader action={{ label: "Full calendar", href: "/tennis/tournaments" }}>This week&apos;s {TOUR_LABEL[tour]} tournaments</SectionHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tourTournaments.map((t) => (
              <TournamentCard key={t.espn_id} t={t} today={today} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader action={{ label: "Top 100", href: `/tennis/${tour}/rankings` }}>{TOUR_LABEL[tour]} rankings</SectionHeader>
        <div className="card overflow-hidden">
          {rankings.map((r) => (
            <Link key={r.player_espn_id} href={`/tennis/${tour}/players/${r.slug}`} className="table-row flex items-center gap-3 px-4 py-2 text-sm first:border-t-0">
              <span className="w-5 text-right text-xs font-bold tabular-nums text-[var(--text-muted)]">{r.rank}</span>
              <Flag code={r.country} />
              <span className="flex-1 truncate font-semibold">{r.name}</span>
              <span className="text-xs tabular-nums text-[var(--text-muted)]">{r.points?.toLocaleString()} pts</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
