export function StatusPill({
  statusState,
  statusDetail,
  date,
  completed,
}: {
  statusState: string | null;
  statusDetail: string | null;
  date: string;
  completed: boolean;
}) {
  if (statusState === "in") {
    return (
      <span className="pill pill-live">
        <span className="live-dot" />
        {statusDetail ?? "Live"}
      </span>
    );
  }

  if (completed) {
    return <span className="pill pill-final">Final</span>;
  }

  return (
    <span className="pill pill-upcoming">
      {new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
    </span>
  );
}
