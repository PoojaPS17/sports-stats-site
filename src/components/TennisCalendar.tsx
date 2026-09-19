import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { AdSlot } from "@/components/AdSlot";
import { TournamentCard } from "@/components/TennisScores";
import type { TennisTournament } from "@/lib/tennis";

function groupByMonth(tournaments: TennisTournament[]): { month: string; items: TennisTournament[] }[] {
  const out: { month: string; items: TennisTournament[] }[] = [];
  for (const t of tournaments) {
    const month = t.start_date ? new Date(t.start_date).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "Dates to be confirmed";
    const last = out[out.length - 1];
    if (last && last.month === month) last.items.push(t);
    else out.push({ month, items: [t] });
  }
  return out;
}

function SeasonPills({ seasons, active }: { seasons: number[]; active: number }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {seasons.map((s, i) => (
        <Link key={s} href={i === 0 ? "/tennis/tournaments" : `/tennis/tournaments/${s}`} className={`nav-pill shrink-0 ${s === active ? "nav-pill-active" : ""}`}>
          {s}
        </Link>
      ))}
    </div>
  );
}

export function TournamentCalendar({ season, seasons, tournaments }: { season: number; seasons: number[]; tournaments: TennisTournament[] }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const months = groupByMonth(tournaments);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`${season} Tennis Calendar`} subtitle={`${tournaments.length} tournaments across the ATP and WTA tours, with champions once each draw is decided.`}>
        <Link href="/tennis" className="nav-pill">
          Scores
        </Link>
      </PageHeader>
      <AdSlot label="Tennis calendar top" />
      <SeasonPills seasons={seasons} active={season} />
      {months.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No tournaments on file for this season.</p>
      ) : (
        months.map((m) => (
          <section key={m.month}>
            <h2 className="mb-3 text-base font-bold tracking-tight sm:text-lg">{m.month}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {m.items.map((t) => (
                <TournamentCard key={t.espn_id} t={t} today={today} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
