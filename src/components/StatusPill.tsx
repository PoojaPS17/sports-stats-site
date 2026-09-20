import { LocalTime } from "./LocalTime";
import { normalizeStage } from "@/lib/stage";
import { calledOffLabel } from "@/lib/gameStatus";

export function StatusPill({
  statusState,
  statusDetail,
  date,
  completed,
  round: rawRound,
  completedLabel,
}: {
  statusState: string | null;
  statusDetail: string | null;
  date: string;
  completed: boolean;
  round?: string | null;
  /** What a finished game with no stage is labelled; "Final" by default, "Result" for cricket. */
  completedLabel?: string;
}) {
  const round = normalizeStage(rawRound);
  if (statusState === "in") {
    return (
      <span className="pill pill-live">
        <span className="live-dot" />
        {round ?? statusDetail ?? "Live"}
      </span>
    );
  }

  if (completed) {
    // "Final" is standard broadcast shorthand for "game over" everywhere — but for a
    // playoff stage like IPL's Qualifier 1/Eliminator, showing "Final" on every one of
    // them is actively misleading (it's also the name of one specific match). Show the
    // real stage instead when we have one; a numbered regular-season match still just
    // says "Final" — except in cricket, where "Final" is only ever the tournament
    // decider, so callers pass "Result" (Cricinfo's word) instead.
    return <span className="pill pill-final">{round ?? completedLabel ?? "Final"}</span>;
  }

  // A game the feed closed without playing ("Postponed", "Canceled") is neither
  // upcoming nor final; showing its old date as a fixture would be wrong.
  const label = calledOffLabel(statusDetail);
  if (label) {
    return <span className="pill pill-final">{round ? `${round} · ${label}` : label}</span>;
  }

  return (
    <span className="pill pill-upcoming">
      {round ? `${round} · ` : ""}
      <LocalTime iso={date} format="date" />
    </span>
  );
}
