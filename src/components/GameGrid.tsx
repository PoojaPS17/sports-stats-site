import { Fragment } from "react";
import { GameCard } from "./GameCard";
import { Kickoff } from "./Kickoff";
import { groupByKickoff } from "@/lib/gameDisplay";
import type { GameRow, League } from "@/lib/queries";

/**
 * A day's games, grouped so that 2+ upcoming games sharing an identical kickoff instant get a small
 * label above them (e.g. "10:30 PM · 9 games") instead of just repeating the same clock time on every
 * card with nothing to explain it -- real NFL/NBA scheduling regularly stacks most of a day's games into
 * one shared window. The label reuses Kickoff, so its wording and timezone handling always match what
 * each card below it already shows. `gridClassName` is the caller's existing grid layout (column counts
 * differ by page); the label spans the full grid width via `col-span-full` inside that same layout.
 */
export function GameGrid({ league, games, gridClassName }: { league: League; games: GameRow[]; gridClassName: string }) {
  const clusters = groupByKickoff(games);
  return (
    <div className={gridClassName}>
      {clusters.map((cluster) => (
        <Fragment key={cluster[0].espn_id}>
          {cluster.length > 1 && (
            <div className="col-span-full flex items-center gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
              <Kickoff league={league} game={cluster[0]} format="time" />
              <span>· {cluster.length} games</span>
            </div>
          )}
          {cluster.map((g) => (
            <GameCard key={g.espn_id} league={league} game={g} />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
