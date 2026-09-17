import { pageMeta } from "@/lib/metadata";
import Link from "next/link";
import { getF1Calendar, getF1Seasons } from "@/lib/f1";
import { AdSlot } from "@/components/AdSlot";
import { F1SeasonSelect } from "@/components/F1SeasonSelect";

export const metadata = pageMeta("F1 Calendar", "Formula 1 race calendar with circuits, dates and winners.");

export const revalidate = 300;

export default async function F1CalendarPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season: seasonParam } = await searchParams;
  const seasons = await getF1Seasons();
  const defaultSeason = seasons[0] ?? new Date().getUTCFullYear();
  const activeSeason = seasonParam && seasons.includes(Number(seasonParam)) ? Number(seasonParam) : defaultSeason;

  const calendar = await getF1Calendar(activeSeason);

  return (
    <div className="flex flex-col gap-6">

      <div className="flex items-center justify-between gap-3">
        <h1 className="page-title">F1 Calendar</h1>
        {seasons.length > 1 && <F1SeasonSelect seasons={seasons} defaultSeason={defaultSeason} />}
      </div>

      <AdSlot label="F1 top" />

      {calendar.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No {activeSeason} races on record.</p>
      ) : (
        <div className="card divide-y divide-[var(--border)]">
          {calendar.map((ev) => {
            const date = new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return (
              <Link
                key={ev.espn_id}
                href={`/f1/events/${ev.espn_id}`}
                className="flex flex-col gap-1 px-4 py-3 transition hover:bg-[var(--surface-muted)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{ev.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {date}
                    {ev.circuit_name && ` · ${ev.circuit_name}`}
                    {ev.circuit_city && ev.circuit_country && ` · ${ev.circuit_city}, ${ev.circuit_country}`}
                  </p>
                </div>
                {ev.winner_name ? (
                  <span className="shrink-0 text-sm">
                    <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Winner </span>
                    <span className="font-semibold">{ev.winner_name}</span>
                  </span>
                ) : (
                  <span className="pill pill-upcoming shrink-0">Upcoming</span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
