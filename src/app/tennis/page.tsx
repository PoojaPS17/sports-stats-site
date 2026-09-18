import type { Metadata } from "next";
import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { PageHeader } from "@/components/PageHeader";
import { SectionHeader } from "@/components/SectionHeader";
import { AdSlot } from "@/components/AdSlot";
import { Flag, TennisDayStrip, TennisDayView, TournamentCard, formatDayLabel } from "@/components/TennisScores";
import { LiveRefresh } from "@/components/LiveRefresh";
import { overlayLiveTennis } from "@/lib/tennisLive";
import { getLatestTennisDay, getTennisDay, getTennisDaysAround, getTennisRankings, getTennisTournamentsAround, TOURS, TOUR_LABEL } from "@/lib/tennis";

export const revalidate = 15;

export const metadata: Metadata = pageMeta(
  "Tennis Scores",
  "Today's tennis scores from every ATP and WTA tournament: set-by-set results, order of play, draws by round, rankings and player records.",
  "/tennis"
);

// Today in US Eastern, the calendar ESPN files matches under.
function easternToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export default async function TennisHubPage() {
  const today = easternToday();
  const [todayMatches, latest] = await Promise.all([getTennisDay(today), getLatestTennisDay()]);
  // A quiet Monday between tournaments falls back to the last day with play.
  const day = todayMatches.length > 0 ? today : (latest ?? today);
  const stored = day === today ? todayMatches : await getTennisDay(day);
  const [{ matches, live }, days, tournaments, atp, wta] = await Promise.all([
    overlayLiveTennis(day, stored),
    getTennisDaysAround(day),
    getTennisTournamentsAround(today),
    getTennisRankings("atp", 5),
    getTennisRankings("wta", 5),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <LiveRefresh active={live} />
      <PageHeader title="Tennis" subtitle="Every ATP and WTA tournament, day by day: set scores, order of play, draws and rankings.">
        <Link href="/tennis/tournaments" className="nav-pill">
          Calendar
        </Link>
        {TOURS.map((t) => (
          <Link key={t} href={`/tennis/${t}/rankings`} className="nav-pill">
            {TOUR_LABEL[t]} rankings
          </Link>
        ))}
      </PageHeader>

      <AdSlot label="Tennis top" />

      <section className="flex flex-col gap-3">
        <SectionHeader description={day === today ? "Today's play, live and completed" : "The most recent day with results"} action={{ label: "All days", href: `/tennis/scores/${day}` }}>
          {formatDayLabel(day)}
        </SectionHeader>
        <TennisDayStrip day={day} daysWithPlay={days} />
        <TennisDayView matches={matches} emptyText="No matches on file for today yet." />
      </section>

      {tournaments.length > 0 && (
        <section>
          <SectionHeader action={{ label: "Full calendar", href: "/tennis/tournaments" }}>This week&apos;s tournaments</SectionHeader>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tournaments.map((t) => (
              <TournamentCard key={t.espn_id} t={t} today={today} />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 md:grid-cols-2">
        {(
          [
            ["atp", atp],
            ["wta", wta],
          ] as const
        ).map(([tour, rows]) => (
          <div key={tour}>
            <SectionHeader action={{ label: "Top 100", href: `/tennis/${tour}/rankings` }}>{TOUR_LABEL[tour]} rankings</SectionHeader>
            <div className="card overflow-hidden">
              {rows.map((r) => (
                <Link key={r.player_espn_id} href={`/tennis/${tour}/players/${r.slug}`} className="table-row flex items-center gap-3 px-4 py-2 text-sm first:border-t-0">
                  <span className="w-5 text-right text-xs font-bold tabular-nums text-[var(--text-muted)]">{r.rank}</span>
                  <Flag code={r.country} />
                  <span className="flex-1 truncate font-semibold">{r.name}</span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">{r.points?.toLocaleString()} pts</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
