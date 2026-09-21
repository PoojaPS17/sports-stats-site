import { Kickoff } from "./Kickoff";
import { finishedPillLabel, gameRoundLabel } from "@/lib/stage";
import { gameCalledOffLabel } from "@/lib/gameStatus";
import type { League } from "@/lib/leagues";

export function StatusPill({
  statusState,
  statusDetail,
  date,
  completed,
  round: rawRound,
  stage,
  competitionType,
  note,
  league,
  kickoff = "date",
}: {
  statusState: string | null;
  statusDetail: string | null;
  date: string;
  completed: boolean;
  round?: string | null;
  /** games.stage and games.competition_type: a play-in game and the NBA Cup final get their own label where a round would show. */
  stage?: string | null;
  competitionType?: string | null;
  /** games.note: what says a regular-season game belongs to the NBA Cup. */
  note?: string | null;
  /** Names the finished word ("Final", "FT", "Result"), the zone of the fixture date in the server render (see LocalTime) and the clock style. */
  league: League;
  /** What an upcoming game's pill says besides its stage: the date alone (a card that shows the time beside it) or date and time. */
  kickoff?: "date" | "datetime";
}) {
  const stageFields = { round: rawRound ?? null, stage, competition_type: competitionType, note };
  const round = gameRoundLabel(stageFields);
  if (statusState === "in") {
    return (
      <span className="pill pill-live">
        <span className="live-dot" />
        {round ?? statusDetail ?? "Live"}
      </span>
    );
  }

  // A game the feed closed without playing ("Postponed", "Canceled") is neither
  // upcoming nor final; showing its old date as a fixture would be wrong. This includes
  // one stored as finished (a cancelled cricket match ESPN files under state "post").
  const label = gameCalledOffLabel({ completed, status_state: statusState, status_detail: statusDetail });
  if (label) {
    return <span className="pill pill-final">{round ? `${round} · ${label}` : label}</span>;
  }

  if (completed) {
    // "Final" is standard broadcast shorthand for "game over" everywhere — but for a
    // playoff stage like IPL's Qualifier 1/Eliminator, showing "Final" on every one of
    // them is actively misleading (it's also the name of one specific match). Show the
    // real stage instead when we have one; a numbered regular-season match still just
    // says "Final" — except in cricket, where "Final" is only ever the tournament
    // decider, so the league supplies "Result" (Cricinfo's word) instead. A game that went to overtime says so
    // ("Final/OT", "Final/2OT"), as NBA.com and NFL.com do, after its stage when it has one.
    return <span className="pill pill-final">{finishedPillLabel(league, { ...stageFields, status_detail: statusDetail })}</span>;
  }

  return (
    <span className="pill pill-upcoming">
      {round ? `${round} · ` : ""}
      <Kickoff league={league} game={{ date, completed, status_state: statusState, status_detail: statusDetail }} format={kickoff} />
    </span>
  );
}
