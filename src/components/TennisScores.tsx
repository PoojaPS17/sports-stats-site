import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { COMPETITION_LABEL, COMPETITION_ORDER, type CompetitionType, type TennisMatch, type TennisSide, type TennisTournament } from "@/lib/tennis";

/* ------------------------------------------------------------------------ */
/* Small pieces                                                              */
/* ------------------------------------------------------------------------ */

// ESPN's country flag set, keyed by the three-letter code its feeds use.
export function Flag({ code, size = 16 }: { code: string | null | undefined; size?: number }) {
  if (!code) return <span style={{ width: size, height: Math.round(size * 0.7) }} className="inline-block shrink-0" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://a.espncdn.com/i/teamlogos/countries/500/${code.toLowerCase()}.png`}
      alt={code}
      title={code}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[2px] object-contain"
    />
  );
}

export function formatDayLabel(day: string, style: "short" | "long" = "long"): string {
  const d = new Date(`${day}T12:00:00Z`);
  return style === "long"
    ? d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
    : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  if (!e) return s.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  const sameMonth = s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear();
  const left = s.toLocaleDateString("en-US", opts);
  const right = sameMonth ? e.getUTCDate() : e.toLocaleDateString("en-US", opts);
  return `${left} – ${right}, ${e.getUTCFullYear()}`;
}

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------------ */
/* One match, ESPN-style: a status line, then one row per side              */
/* ------------------------------------------------------------------------ */

function SideRow({ tour, side, won, decided, setCount }: { tour: string; side: TennisSide; won: boolean; decided: boolean; setCount: number }) {
  const loser = decided && !won;
  const nameClass = loser ? "text-[var(--text-muted)]" : "font-semibold text-[var(--text)]";
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {side.names.map((name, i) => {
          const slug = side.slugs?.[i];
          const label = (
            <span className={`truncate text-[15px] ${nameClass}`}>
              {i === 0 && side.seed != null && <span className="mr-1 text-xs font-medium text-[var(--text-faint)]">({side.seed})</span>}
              {name}
            </span>
          );
          return (
            <span key={`${name}-${i}`} className="flex min-w-0 items-center gap-1.5">
              <Flag code={side.countries?.[i]} />
              {slug ? (
                <Link href={`/tennis/${tour}/players/${slug}`} className="min-w-0 hover:text-[var(--accent)]">
                  {label}
                </Link>
              ) : (
                label
              )}
            </span>
          );
        })}
      </div>
      {decided && won && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Winner" className="shrink-0 text-[var(--win)]">
          <path d="M5 12l5 5L20 7" />
        </svg>
      )}
      {setCount > 0 && (
        <div className="flex shrink-0 gap-2.5 tabular-nums">
          {Array.from({ length: setCount }, (_, i) => {
            const set = side.sets[i];
            return (
              <span key={i} className={`w-5 text-right text-[15px] ${set?.winner ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                {set ? set.games : ""}
                {set?.tiebreak != null && <sup className="ml-px text-[9px] font-medium">{set.tiebreak}</sup>}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TennisMatchLine({ match, showTournament = false }: { match: TennisMatch; showTournament?: boolean }) {
  const decided = match.winner_side != null;
  const live = match.status_state === "in";
  const setCount = Math.max(match.side1.sets?.length ?? 0, match.side2.sets?.length ?? 0);
  const where = [match.round, match.court].filter(Boolean).join(" · ");
  const tourForLinks = match.tour;

  return (
    <div className="flex flex-col px-4 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex min-w-0 items-center gap-2">
          {live ? (
            <span className="pill pill-live">{match.status_detail ?? "Live"}</span>
          ) : match.completed ? (
            <span className="pill pill-final">{match.status_detail && match.status_detail !== "Final" ? match.status_detail : "Final"}</span>
          ) : (
            <span className="pill pill-upcoming">
              <LocalTime iso={match.date} format="time" />
            </span>
          )}
          {showTournament && (
            <Link href={`/tennis/tournaments/${match.tournament_espn_id}`} className="truncate font-semibold text-[var(--text-muted)] hover:text-[var(--accent)]">
              {match.tournament_name}
            </Link>
          )}
        </span>
        {where && <span className="shrink-0 truncate text-[var(--text-faint)]">{where}</span>}
      </div>
      <SideRow tour={tourForLinks} side={match.side1} won={match.winner_side === 1} decided={decided} setCount={setCount} />
      <SideRow tour={tourForLinks} side={match.side2} won={match.winner_side === 2} decided={decided} setCount={setCount} />
      {!decided && match.completed && match.status_detail && match.status_detail !== "Final" && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">{match.status_detail}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* A day (or a tournament): matches grouped by tournament, then by draw      */
/* ------------------------------------------------------------------------ */

type Group = { key: string; tournament: { espn_id: string | null; name: string; location: string | null; major: boolean }; draws: { type: CompetitionType | null; matches: TennisMatch[] }[] };

export function groupMatches(matches: TennisMatch[]): Group[] {
  const byTournament = new Map<string, Group>();
  for (const m of matches) {
    const key = m.tournament_espn_id ?? m.tournament_name;
    let g = byTournament.get(key);
    if (!g) {
      g = { key, tournament: { espn_id: m.tournament_espn_id, name: m.tournament_name, location: m.tournament_location, major: m.major }, draws: [] };
      byTournament.set(key, g);
    }
    let draw = g.draws.find((d) => d.type === m.competition_type);
    if (!draw) {
      draw = { type: m.competition_type, matches: [] };
      g.draws.push(draw);
    }
    draw.matches.push(m);
  }
  for (const g of byTournament.values()) {
    g.draws.sort((a, b) => (a.type ? COMPETITION_ORDER.indexOf(a.type) : 99) - (b.type ? COMPETITION_ORDER.indexOf(b.type) : 99));
  }
  return [...byTournament.values()];
}

export function TennisDrawSection({ type, matches, byRound = false }: { type: CompetitionType | null; matches: TennisMatch[]; byRound?: boolean }) {
  const rounds: { label: string | null; matches: TennisMatch[] }[] = [];
  for (const m of matches) {
    const label = byRound ? m.round : null;
    const last = rounds[rounds.length - 1];
    if (last && last.label === label) last.matches.push(m);
    else rounds.push({ label, matches: [m] });
  }
  return (
    <div>
      <p className="border-b border-[var(--border)] px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {type ? COMPETITION_LABEL[type] : "Singles"}
      </p>
      {rounds.map((r, i) => (
        <div key={`${r.label}-${i}`}>
          {byRound && r.label && <p className="bg-[var(--surface-muted)] px-4 py-1 text-xs font-semibold text-[var(--text-muted)]">{r.label}</p>}
          <div className="grid divide-y divide-[var(--border)] md:grid-cols-2 md:divide-y-0 md:[&>*:nth-child(n+3)]:border-t md:[&>*:nth-child(odd)]:border-r md:[&>*]:border-[var(--border)]">
            {r.matches.map((m) => (
              <TennisMatchLine key={m.espn_id} match={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TennisDayView({ matches, emptyText = "No matches on this day." }: { matches: TennisMatch[]; emptyText?: string }) {
  const groups = groupMatches(matches);
  if (groups.length === 0) return <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">{emptyText}</p>;
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} className="card overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[var(--border)] px-4 py-3">
            <h2 className="text-base font-bold tracking-tight sm:text-lg">
              {g.tournament.espn_id ? (
                <Link href={`/tennis/tournaments/${g.tournament.espn_id}`} className="hover:text-[var(--accent)]">
                  {g.tournament.name} <span aria-hidden="true">→</span>
                </Link>
              ) : (
                g.tournament.name
              )}
              {g.tournament.major && <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">Grand Slam</span>}
            </h2>
            {g.tournament.location && <span className="text-xs text-[var(--text-muted)]">{g.tournament.location}</span>}
          </div>
          {g.draws.map((d) => (
            <TennisDrawSection key={d.type ?? "singles"} type={d.type} matches={d.matches} />
          ))}
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Day strip                                                                 */
/* ------------------------------------------------------------------------ */

export function TennisDayStrip({ day, daysWithPlay, basePath = "/tennis/scores" }: { day: string; daysWithPlay: string[]; basePath?: string }) {
  const has = new Set(daysWithPlay);
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(day, i - 3));
  return (
    <nav aria-label="Day" className="flex items-center gap-1.5 overflow-x-auto pb-1">
      <Link href={`${basePath}/${shiftDay(day, -1)}`} className="nav-pill shrink-0" aria-label="Previous day">
        ‹
      </Link>
      {days.map((d) => {
        const active = d === day;
        return (
          <Link key={d} href={`${basePath}/${d}`} className={`nav-pill shrink-0 ${active ? "nav-pill-active" : has.has(d) ? "" : "opacity-60"}`}>
            <span className="text-[10px] font-semibold uppercase">{new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</span>{" "}
            <span className="tabular-nums">{formatDayLabel(d, "short").replace(/^\w+,\s*/, "")}</span>
          </Link>
        );
      })}
      <Link href={`${basePath}/${shiftDay(day, 1)}`} className="nav-pill shrink-0" aria-label="Next day">
        ›
      </Link>
    </nav>
  );
}

/* ------------------------------------------------------------------------ */
/* Tournament card                                                           */
/* ------------------------------------------------------------------------ */

export function TournamentCard({ t, today }: { t: TennisTournament; today?: string }) {
  const range = formatDateRange(t.start_date, t.end_date);
  const inPlay = today && t.start_date && t.end_date && t.start_date.slice(0, 10) <= today && t.end_date.slice(0, 10) >= today;
  const tourLabel = t.tour === "both" ? "ATP · WTA" : t.tour.toUpperCase();
  return (
    <Link href={`/tennis/tournaments/${t.espn_id}`} className="card card-link flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        <span>
          {tourLabel}
          {t.major && <span className="ml-2 text-[var(--accent)]">Grand Slam</span>}
        </span>
        {inPlay ? <span className="pill pill-live">In play</span> : t.completed_count > 0 && t.completed_count === t.match_count && t.match_count > 0 ? <span className="pill pill-final">Done</span> : null}
      </div>
      <p className="truncate text-[15px] font-semibold">{t.name}</p>
      <p className="text-xs text-[var(--text-muted)]">
        {[t.location, range].filter(Boolean).join(" · ")}
      </p>
      {t.champions.length > 0 && (
        <p className="truncate text-xs text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">Champion{t.champions.length > 1 ? "s" : ""}:</span>{" "}
          {t.champions.map((c) => c.names.join(" / ")).join(" · ")}
        </p>
      )}
    </Link>
  );
}
