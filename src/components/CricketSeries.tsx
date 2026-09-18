import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { TeamLogo } from "@/components/TeamLogo";
import { LEAGUE_LABEL } from "@/lib/leagues";
import { SERIES_KIND_LABEL, type CricketSeries, type CricketSeriesMatch, type SeriesSide } from "@/lib/cricketSeries";

export function formatSeriesDates(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const sameDay = s.toISOString().slice(0, 10) === e.toISOString().slice(0, 10);
  if (sameDay) return s.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${s.toLocaleDateString("en-US", opts)} – ${sameMonth ? e.getUTCDate() : e.toLocaleDateString("en-US", opts)}, ${e.getUTCFullYear()}`;
}

/** Where a match's scorecard lives: ScoreDB's own page when the competition is archived, else the live page. */
export function matchHref(m: CricketSeriesMatch): string {
  return m.scorecard_league ? `/${m.scorecard_league}/games/${m.espn_id}` : `/cricket/matches/${m.espn_id}`;
}

// `now` comes from the page (render must stay pure), as milliseconds since the epoch.
export function SeriesCard({ s, now }: { s: CricketSeries; now: number }) {
  const dates = formatSeriesDates(s.start_date, s.end_date);
  const inPlay = s.live_count > 0 || (s.start_date && s.end_date && new Date(s.start_date).getTime() <= now && new Date(s.end_date).getTime() + 86_400_000 >= now);
  const done = s.match_count > 0 && s.completed_count === s.match_count && s.end_date && new Date(s.end_date).getTime() < now;
  return (
    <Link href={`/cricket/series/${s.espn_id}`} className="card card-link flex flex-col gap-1.5 px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <span className="truncate">
          {SERIES_KIND_LABEL[s.kind]}
          {s.formats.length > 0 && <span className="ml-2 font-semibold normal-case tracking-normal text-[var(--text-faint)]">{s.formats.join(" · ")}</span>}
        </span>
        {s.live_count > 0 ? <span className="pill pill-live">Live</span> : inPlay ? <span className="pill pill-upcoming">In progress</span> : done ? <span className="pill pill-final">Completed</span> : null}
      </div>
      <p className="text-[15px] font-semibold leading-snug">{s.name}</p>
      <p className="text-xs text-[var(--text-muted)]">
        {[dates, s.match_count > 0 ? `${s.match_count} match${s.match_count === 1 ? "" : "es"}` : null].filter(Boolean).join(" · ")}
      </p>
      {s.teams.length > 0 && s.teams.length <= 4 && (
        <div className="flex items-center gap-1.5">
          {s.teams.map((t) => (
            <TeamLogo key={t.id} name={t.name} logoUrl={t.logo} size={20} />
          ))}
          <span className="truncate text-xs text-[var(--text-muted)]">{s.teams.map((t) => t.abbreviation ?? t.name).join(" · ")}</span>
        </div>
      )}
      {s.league && <p className="text-xs font-semibold text-[var(--accent)]">Full coverage: {LEAGUE_LABEL[s.league]} tables, scorecards and stats</p>}
    </Link>
  );
}

function Side({ side, decided }: { side: SeriesSide | null; decided: boolean }) {
  if (!side) return null;
  const loser = decided && !side.winner;
  return (
    <div className="flex items-center gap-2 py-0.5">
      <TeamLogo name={side.name} logoUrl={side.logo} size={20} />
      <span className={`min-w-0 flex-1 truncate text-[15px] ${loser ? "text-[var(--text-muted)]" : "font-semibold"}`}>{side.name}</span>
      <span className={`shrink-0 text-sm tabular-nums ${loser ? "text-[var(--text-muted)]" : "font-bold"}`}>{side.score ?? ""}</span>
    </div>
  );
}

export function SeriesMatchRow({ m, showSeries = false }: { m: CricketSeriesMatch; showSeries?: boolean }) {
  const live = m.status_state === "in";
  const done = m.status_state === "post";
  const decided = done && Boolean(m.home?.winner || m.away?.winner);
  return (
    <Link href={matchHref(m)} className="flex flex-col px-4 py-2.5 hover:bg-[var(--surface-muted)]">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-2">
          {live ? <span className="pill pill-live">Live</span> : done ? <span className="pill pill-final">Result</span> : <span className="pill pill-upcoming"><LocalTime iso={m.date} format="datetime" /></span>}
          {showSeries && <span className="truncate font-semibold text-[var(--text-muted)]">{m.series_name}</span>}
        </span>
        <span className="shrink-0 truncate text-[var(--text-faint)]">{[m.description, m.class_card].filter(Boolean).join(" · ")}</span>
      </div>
      <Side side={m.home} decided={decided} />
      <Side side={m.away} decided={decided} />
      {m.status_summary && (live || done) && <p className="mt-1 text-xs text-[var(--text-muted)]">{m.status_summary}</p>}
    </Link>
  );
}

export function SeriesMatchList({ matches, showSeries = false }: { matches: CricketSeriesMatch[]; showSeries?: boolean }) {
  if (matches.length === 0) return null;
  return (
    <div className="card grid divide-y divide-[var(--border)] overflow-hidden md:grid-cols-2 md:divide-y-0 md:[&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(odd)]:border-r md:[&>*]:border-[var(--border)]">
      {matches.map((m) => (
        <SeriesMatchRow key={m.espn_id} m={m} showSeries={showSeries} />
      ))}
    </div>
  );
}
