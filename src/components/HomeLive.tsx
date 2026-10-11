import Link from "next/link";
import { GameCard } from "@/components/GameCard";
import { SeriesMatchList } from "@/components/CricketSeries";
import { TennisMatchLine } from "@/components/TennisScores";
import { LocalTime } from "@/components/LocalTime";
import type { HomeData } from "@/lib/homeData";
import type { F1EventRow } from "@/lib/f1";
import { f1RaceInstant } from "@/lib/f1Dates";
import { hasAttr, sportOfLeague } from "@/lib/sportFilter";

// Dated by the Race (weekday, date and time in the visitor's zone), not the practice day the weekend opens on. The time always names its zone:
// the server's first paint is UTC and says so (a circuit-local clock with no zone beside it read as the visitor's own), the visitor's own zone follows.
export function F1Card({ ev }: { ev: F1EventRow }) {
  const where = [ev.circuit_name, ev.circuit_city ?? ev.circuit_country].filter(Boolean).join(", ");
  return (
    <Link href={`/f1/events/${ev.espn_id}`} className="card block px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="pill pill-upcoming">Formula 1 · race weekend</span>
        <LocalTime iso={f1RaceInstant(ev).toISOString()} format="datetime" showZone serverTimeZone="UTC" className="font-medium text-[var(--text-muted)]" />
      </div>
      <p className="text-[15px] font-semibold">{ev.name}</p>
      {where && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{where}</p>}
    </Link>
  );
}

/** Last item of a card grid on the homepage: it takes whatever room the final row has left, so the grid never ends on a lone card with a hole beside it. */
function AllScoresTile() {
  return (
    <Link href="/scores" className="fill-tile">
      All scores <span aria-hidden>→</span>
    </Link>
  );
}

/** What is in play right now, across every sport: cards, no heading. The first-visit "Live now" tab and the built page's "Live now" section both draw it. */
export function LiveNowList({ data, fill = false }: { data: HomeData; fill?: boolean }) {
  const cols = fill ? "fill-grid" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";
  const { liveGames, liveTennis } = data;
  const liveCricket = data.liveCricket.slice(0, 6);
  return (
    <div className="flex flex-col gap-3">
      {liveGames.length > 0 && (
        <div className={cols} data-has={hasAttr(liveGames.map((g) => sportOfLeague(g.league)))}>
          {liveGames.map((g) => (
            <div key={`${g.league}-${g.espn_id}`} className="sf-item" data-sport={sportOfLeague(g.league)}>
              <GameCard league={g.league} game={g} />
            </div>
          ))}
          {fill && <AllScoresTile />}
        </div>
      )}
      {liveCricket.length > 0 && (
        <div data-sport="cricket" data-has="cricket">
          <SeriesMatchList matches={liveCricket} showSeries />
          {data.liveCricket.length > liveCricket.length && (
            <Link href="/cricket/series" className="mt-2 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
              All {data.liveCricket.length} live cricket matches →
            </Link>
          )}
        </div>
      )}
      {liveTennis.length > 0 && (
        <div className="card divide-y divide-[var(--border)] overflow-hidden" data-sport="tennis" data-has="tennis">
          {liveTennis.map((m) => (
            <TennisMatchLine key={m.espn_id} match={m} showTournament />
          ))}
        </div>
      )}
    </div>
  );
}

/** The headline fixtures of the coming week, no heading. */
export function ComingUpList({ data, fill = false }: { data: HomeData; fill?: boolean }) {
  const cols = fill ? "fill-grid" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";
  const { upcomingGames, nextCricket, nextTennis, f1 } = data;
  return (
    <div className="flex flex-col gap-3">
      {(upcomingGames.length > 0 || f1) && (
        <div className={cols} data-has={hasAttr([...upcomingGames.map((g) => sportOfLeague(g.league)), ...(f1 ? ["f1" as const] : [])])}>
          {upcomingGames.map((g) => (
            <div key={`${g.league}-${g.espn_id}`} className="sf-item" data-sport={sportOfLeague(g.league)}>
              <GameCard league={g.league} game={g} />
            </div>
          ))}
          {f1 && (
            <div className="sf-item" data-sport="f1">
              <F1Card ev={f1} />
            </div>
          )}
          {fill && <AllScoresTile />}
        </div>
      )}
      {nextCricket.length > 0 && (
        <div data-sport="cricket" data-has="cricket">
          <SeriesMatchList matches={nextCricket} showSeries />
        </div>
      )}
      {nextTennis.length > 0 && (
        <div className="card divide-y divide-[var(--border)] overflow-hidden" data-sport="tennis" data-has="tennis">
          {nextTennis.map((m) => (
            <TennisMatchLine key={m.espn_id} match={m} showTournament />
          ))}
        </div>
      )}
    </div>
  );
}

export const liveCountOf = (d: Pick<HomeData, "liveGames" | "liveCricket" | "liveTennis">) => d.liveGames.length + d.liveCricket.length + d.liveTennis.length;
export const hasComingUp = (d: Pick<HomeData, "upcomingGames" | "nextCricket" | "nextTennis" | "f1">) => d.upcomingGames.length + d.nextCricket.length + d.nextTennis.length > 0 || !!d.f1;
