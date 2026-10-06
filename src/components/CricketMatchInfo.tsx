import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { LocalTime } from "@/components/LocalTime";
import { teamDisplayName } from "@/lib/teamName";

// The match facts a scorecard page is expected to carry, as a definition list: series, stage, format,
// date, venue, officials, player of the match and the result. Rows with nothing to say are left out.
export function CricketMatchInfo({
  series,
  stage,
  format,
  date,
  venue,
  officials,
  playerOfTheMatch,
  result,
  collapsed = false,
}: {
  series: { name: string; href: string | null } | null;
  stage: string | null;
  format: string | null;
  date: string | null;
  venue: string | null;
  officials: { name: string; role: string }[];
  playerOfTheMatch: string | null;
  result: string | null;
  /** Closed by default as a details card (beside the Playing XI); the heading stays an h2 inside the summary. */
  collapsed?: boolean;
}) {
  const umpires = officials.filter((o) => /umpire/i.test(o.role) && !/tv|third|reserve|fourth/i.test(o.role)).map((o) => o.name);
  const tvUmpires = officials.filter((o) => /tv|third/i.test(o.role)).map((o) => o.name);
  const referees = officials.filter((o) => /referee/i.test(o.role)).map((o) => o.name);
  const rows: [string, React.ReactNode][] = [];
  if (series) {
    rows.push([
      "Series",
      series.href ? (
        <Link key="series" href={series.href} className="font-semibold text-[var(--accent)] hover:underline">
          {series.name}
        </Link>
      ) : (
        series.name
      ),
    ]);
  }
  if (stage) rows.push(["Stage", stage]);
  if (format) rows.push(["Format", format]);
  if (date) rows.push(["Date", <LocalTime key="date" iso={date} format="datetime" />]);
  if (venue) rows.push(["Venue", venue]);
  if (umpires.length > 0) rows.push(["Umpires", umpires.join(", ")]);
  if (tvUmpires.length > 0) rows.push(["TV umpire", tvUmpires.join(", ")]);
  if (referees.length > 0) rows.push(["Match referee", referees.join(", ")]);
  if (playerOfTheMatch) rows.push(["Player of the Match", playerOfTheMatch]);
  if (result) rows.push(["Result", teamDisplayName(result)]);
  if (rows.length === 0) return null;
  const list = (
    <dl className={collapsed ? "grid grid-cols-1 text-sm" : "card grid grid-cols-1 gap-x-6 text-sm sm:grid-cols-2"}>
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
            <dt className="shrink-0 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
            <dd className="min-w-0 text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
  );
  if (collapsed) {
    return (
      <details className="card overflow-hidden">
        <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
          <h2 className="text-sm font-bold">Match info</h2>
          <span className="text-xs font-bold text-[var(--sig-ink)]">Show</span>
        </summary>
        <div className="border-t border-[var(--border)]">{list}</div>
      </details>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>Match info</SectionHeader>
      {list}
    </section>
  );
}
