import { LocalTime } from "./LocalTime";

export function StatusPill({
  statusState,
  statusDetail,
  date,
  completed,
  round,
}: {
  statusState: string | null;
  statusDetail: string | null;
  date: string;
  completed: boolean;
  round?: string | null;
}) {
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
    // says "Final".
    return <span className="pill pill-final">{round ?? "Final"}</span>;
  }

  return (
    <span className="pill pill-upcoming">
      {round ? `${round} · ` : ""}
      <LocalTime iso={date} format="date" />
    </span>
  );
}
