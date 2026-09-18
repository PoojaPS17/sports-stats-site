import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { GameCard } from "@/components/GameCard";
import { SeriesMatchList } from "@/components/CricketSeries";
import { TennisMatchLine } from "@/components/TennisScores";
import { LiveRefresh } from "@/components/LiveRefresh";
import { LocalTime } from "@/components/LocalTime";
import { getLiveGames, getNextF1Event, getUpcomingGames } from "@/lib/homeFeed";
import { overlayLiveGames } from "@/lib/gamesLive";
import { byPriority, getLiveCricketMatches, getUpcomingCricketMatches, type CricketSeriesMatch } from "@/lib/cricketSeries";
import { overlayLiveCricket } from "@/lib/cricketLive";
import { getTennisDay } from "@/lib/tennis";
import { overlayLiveTennis } from "@/lib/tennisLive";
import { easternDay } from "@/lib/tennisFeed";
import type { F1EventRow } from "@/lib/f1";

// Cricket beyond the archived competitions counts as "important" here when it is
// international; domestic first-class and youth cricket stays in the Cricket block.
function important(m: CricketSeriesMatch): boolean {
  return m.scorecard_league !== null || m.series_kind === "international" || m.series_kind === "womens-international";
}

const FULL_MEMBERS = /^(India|Australia|England|Pakistan|South Africa|New Zealand|Sri Lanka|West Indies|Bangladesh|Afghanistan|Zimbabwe|Ireland)( Women)?$/;

// Full-member internationals before associate fixtures; the archived competitions
// (IPL, World Cups) rank with them.
function weight(m: CricketSeriesMatch): number {
  if (m.scorecard_league) return 0;
  const full = [m.home, m.away].filter((s) => s && FULL_MEMBERS.test(s.name)).length;
  return 2 - full;
}

function byImportance(a: CricketSeriesMatch, b: CricketSeriesMatch): number {
  return weight(a) - weight(b) || byPriority(a, b);
}

function F1Card({ ev }: { ev: F1EventRow }) {
  const where = [ev.circuit_name, ev.circuit_city ?? ev.circuit_country].filter(Boolean).join(", ");
  return (
    <Link href={`/f1/events/${ev.espn_id}`} className="card block px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="pill pill-upcoming">Formula 1 · race weekend</span>
        <LocalTime iso={ev.date} format="date" className="font-medium text-[var(--text-muted)]" />
      </div>
      <p className="text-[15px] font-semibold">{ev.name}</p>
      {where && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{where}</p>}
    </Link>
  );
}

export async function HomeLive() {
  const today = easternDay(new Date().toISOString());
  const [storedGames, upcomingGames, storedCricketLive, upcomingCricket, tennisRows, f1] = await Promise.all([
    getLiveGames(),
    getUpcomingGames(6, 2),
    getLiveCricketMatches(),
    getUpcomingCricketMatches(12, 7),
    getTennisDay(today),
    getNextF1Event(7),
  ]);
  const [games, cricketLiveAll, tennis] = await Promise.all([overlayLiveGames(storedGames), overlayLiveCricket(storedCricketLive), overlayLiveTennis(today, tennisRows)]);

  const liveGames = games.filter((g) => g.status_state === "in");
  const liveGameIds = new Set(liveGames.map((g) => g.espn_id));
  // A live IPL or World Cup match is a league game above; the series feed carries the rest.
  const liveCricket = cricketLiveAll.filter((m) => m.status_state === "in" && !liveGameIds.has(m.espn_id) && important(m)).sort(byImportance);
  const liveTennis = tennis.matches.filter((m) => m.status_state === "in").sort((a, b) => Number(b.major) - Number(a.major) || (b.round_number ?? 0) - (a.round_number ?? 0)).slice(0, 4);
  const anyLive = liveGames.length > 0 || liveCricket.length > 0 || liveTennis.length > 0;

  const upcomingIds = new Set(upcomingGames.map((g) => g.espn_id));
  const nextCricket = upcomingCricket.filter((m) => !upcomingIds.has(m.espn_id) && !liveGameIds.has(m.espn_id) && important(m)).sort(byImportance).slice(0, 3);
  const nextTennis = tennis.matches.filter((m) => m.status_state !== "in" && !m.completed && m.major).slice(0, 2);

  return (
    <>
      <LiveRefresh active={anyLive} />
      <section>
        <SectionHeader description={anyLive ? "Scores refresh every 30 seconds" : "Across football, the NFL, NBA, cricket and tennis"}>
          <span className="flex items-center gap-2">
            {anyLive && <span className="live-dot" />}
            Live now
          </span>
        </SectionHeader>
        {!anyLive ? (
          <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">Nothing in play right now. The next fixtures are below.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {liveGames.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {liveGames.map((g) => (
                  <GameCard key={`${g.league}-${g.espn_id}`} league={g.league} game={g} />
                ))}
              </div>
            )}
            {liveCricket.length > 0 && <SeriesMatchList matches={liveCricket} showSeries />}
            {liveTennis.length > 0 && (
              <div className="card divide-y divide-[var(--border)] overflow-hidden">
                {liveTennis.map((m) => (
                  <TennisMatchLine key={m.espn_id} match={m} showTournament />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <SectionHeader description="The biggest fixtures of the next seven days" action={{ label: "All cricket series", href: "/cricket/series" }}>
          Upcoming
        </SectionHeader>
        {upcomingGames.length + nextCricket.length + nextTennis.length === 0 && !f1 ? (
          <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">No fixtures listed for the coming week yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {(upcomingGames.length > 0 || f1) && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingGames.map((g) => (
                  <GameCard key={`${g.league}-${g.espn_id}`} league={g.league} game={g} />
                ))}
                {f1 && <F1Card ev={f1} />}
              </div>
            )}
            {nextCricket.length > 0 && <SeriesMatchList matches={nextCricket} showSeries />}
            {nextTennis.length > 0 && (
              <div className="card divide-y divide-[var(--border)] overflow-hidden">
                {nextTennis.map((m) => (
                  <TennisMatchLine key={m.espn_id} match={m} showTournament />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
