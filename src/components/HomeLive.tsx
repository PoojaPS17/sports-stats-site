import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { GameCard } from "@/components/GameCard";
import { SeriesMatchList } from "@/components/CricketSeries";
import { TennisMatchLine } from "@/components/TennisScores";
import { LiveRefresh } from "@/components/LiveRefresh";
import { LocalTime } from "@/components/LocalTime";
import type { HomeData } from "@/lib/homeData";
import type { F1EventRow } from "@/lib/f1";

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

// The two blocks at the top of the homepage: what is in play right now across every
// sport, and the headline fixtures of the coming week. Everything here is read once
// per request in getHomeData(); the league blocks below it skip what these show.
export function HomeLive({ data }: { data: HomeData }) {
  const { anyLive, liveGames, liveTennis, upcomingGames, nextCricket, nextTennis, f1 } = data;
  const liveCricket = data.liveCricket.slice(0, 6);
  const liveCount = liveGames.length + data.liveCricket.length + liveTennis.length;

  return (
    <>
      <LiveRefresh active={anyLive} />
      <section>
        <SectionHeader description={anyLive ? `${liveCount} in play · scores refresh every 10 seconds` : "Across football, the NFL, NBA, cricket and tennis"}>
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {liveGames.map((g) => (
                  <GameCard key={`${g.league}-${g.espn_id}`} league={g.league} game={g} />
                ))}
              </div>
            )}
            {liveCricket.length > 0 && (
              <div>
                <SeriesMatchList matches={liveCricket} showSeries />
                {data.liveCricket.length > liveCricket.length && (
                  <Link href="/cricket/series" className="mt-2 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
                    All {data.liveCricket.length} live cricket matches →
                  </Link>
                )}
              </div>
            )}
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
        <SectionHeader description="The biggest fixtures of the next seven days, across every sport">
          Coming up
        </SectionHeader>
        {upcomingGames.length + nextCricket.length + nextTennis.length === 0 && !f1 ? (
          <p className="card px-4 py-4 text-sm text-[var(--text-muted)]">No fixtures listed for the coming week yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {(upcomingGames.length > 0 || f1) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
