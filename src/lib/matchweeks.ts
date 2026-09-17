// Matchweek / NFL-week hubs derived from the games archive. Nothing in the feed
// tags a game with its round, so rounds are reconstructed:
//   - soccer: rounds are found by walking matchdays and starting a new round when
//     teams repeat; stray rescheduled games go back to the earliest round neither
//     team has played in
//   - NFL: seven-day buckets from the opening Thursday, then the playoff rounds
//   - other leagues: seven-day buckets from the first game of the season
import { pool } from "./db";
import { GAME_SELECT, type GameRow } from "./queries";
import { computeTable, isSoccer, type ComputedTableRow, type ResultRow, type TeamRef } from "./analytics";
import type { League } from "./leagues";

export interface Matchweek {
  /** 1-based position in the season; doubles as the URL segment. */
  index: number;
  label: string;
  shortLabel: string;
  start: string;
  end: string;
  games: GameRow[];
  completed: number;
  playoff: boolean;
}

export function supportsMatchweeks(league: League): boolean {
  return league === "epl" || league === "laliga" || league === "nfl" || league === "nba";
}

export function weekNoun(league: League): string {
  return isSoccer(league) ? "Matchweek" : "Week";
}

/** Public path for a week hub: /epl/matchweek/5, /nfl/week/3, /nfl/week/2025/3. */
export function weekPath(league: League, index: number, season?: number | null): string {
  const seg = isSoccer(league) ? "matchweek" : "week";
  return season ? `/${league}/${seg}/${season}/${index}` : `/${league}/${seg}/${index}`;
}

export function weekIndexPath(league: League, season?: number | null): string {
  const seg = isSoccer(league) ? "matchweek" : "week";
  return season ? `/${league}/${seg}/${season}` : `/${league}/${seg}`;
}

export async function getSeasonGames(league: League, season: number): Promise<GameRow[]> {
  const { rows } = await pool.query(`${GAME_SELECT} where g.league = $1 and g.season_year = $2 order by g.date asc, g.espn_id asc`, [league, season]);
  return rows;
}

export async function getSeasonsWithGames(league: League): Promise<number[]> {
  const { rows } = await pool.query(`select distinct season_year from games where league = $1 and season_year is not null order by season_year desc`, [league]);
  return rows.map((r) => r.season_year as number);
}

const DAY = 86_400_000;

function fmtRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (s.toDateString() === e.toDateString()) return s.toLocaleDateString("en-US", opts);
  if (s.getUTCMonth() === e.getUTCMonth()) return `${s.toLocaleDateString("en-US", opts)}–${e.getUTCDate()}`;
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

// Normalise the feed's per-conference, per-game playoff labels into one round:
// "AFC Wild Card Playoffs" / "NFC Wild Card Playoffs" → "Wild Card";
// "East 1st Round - Game 3" → "First Round"; "West Finals - Game 5" → "Conference Finals".
function playoffRoundLabel(round: string): string {
  const conference = /^(AFC|NFC|East|West)\b/i.test(round);
  const r = round
    .replace(/\s*-\s*Game\s*\d+$/i, "")
    .replace(/^(AFC|NFC|East|West)\s+/i, "")
    .replace(/\s+Playoffs$/i, "")
    .trim();
  if (/championship/i.test(r)) return "Conference Championships";
  if (/^1st round$/i.test(r)) return "First Round";
  if (/^semifinals$/i.test(r)) return "Conference Semifinals";
  if (/^finals$/i.test(r)) return conference ? "Conference Finals" : "Finals";
  if (/^nba finals$/i.test(r)) return "Finals";
  return r;
}

function finish(groups: { label: string; shortLabel: string; games: GameRow[]; playoff: boolean }[]): Matchweek[] {
  return groups
    .filter((g) => g.games.length > 0)
    .map((g, i) => {
      const dates = g.games.map((x) => new Date(x.date).getTime());
      return {
        index: i + 1,
        label: g.label,
        shortLabel: g.shortLabel,
        start: new Date(Math.min(...dates)).toISOString(),
        end: new Date(Math.max(...dates)).toISOString(),
        games: g.games,
        completed: g.games.filter((x) => x.completed).length,
        playoff: g.playoff,
      };
    });
}

export function buildMatchweeks(league: League, games: GameRow[]): Matchweek[] {
  if (games.length === 0) return [];
  const sorted = [...games].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (isSoccer(league)) {
    // 1. Walk the season day by day. A day whose teams have already appeared in the
    //    current round starts a new round, provided it is a real matchday (3+ games).
    //    A day with only one or two such games is a stray: a Friday opener before
    //    the weekend proper, or a rescheduled fixture squeezed into a midweek.
    const byDay = new Map<string, GameRow[]>();
    for (const g of sorted) {
      const key = g.date.toString().slice(0, 10);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(g);
    }
    const rounds = new Map<number, GameRow[]>();
    const used = new Map<string, Set<number>>();
    const mark = (id: string, r: number) => {
      if (!used.has(id)) used.set(id, new Set());
      used.get(id)!.add(r);
    };
    const loose: { g: GameRow }[] = [];
    let mainIndex = 0;
    let roundTeams = new Set<string>();
    const MIN_MATCHDAY = 3;
    for (const games of byDay.values()) {
      const collides = (g: GameRow) => roundTeams.has(g.home_team_espn_id) || roundTeams.has(g.away_team_espn_id);
      const anyCollision = games.some(collides);
      if (mainIndex === 0 || (anyCollision && games.length >= MIN_MATCHDAY)) {
        mainIndex++;
        roundTeams = new Set();
      }
      for (const g of games) {
        if (mainIndex > 0 && anyCollision && games.length < MIN_MATCHDAY && collides(g)) {
          loose.push({ g });
          continue;
        }
        if (!rounds.has(mainIndex)) rounds.set(mainIndex, []);
        rounds.get(mainIndex)!.push(g);
        roundTeams.add(g.home_team_espn_id);
        roundTeams.add(g.away_team_espn_id);
        mark(g.home_team_espn_id, mainIndex);
        mark(g.away_team_espn_id, mainIndex);
      }
    }
    // 3. Stray games (postponed fixtures played midweek, a Friday opener, or a run
    //    of two-game days) go to the earliest round neither team has played in.
    for (const { g } of loose) {
      const a = used.get(g.home_team_espn_id) ?? new Set<number>();
      const b = used.get(g.away_team_espn_id) ?? new Set<number>();
      let r = 1;
      while (a.has(r) || b.has(r)) r++;
      if (!rounds.has(r)) rounds.set(r, []);
      rounds.get(r)!.push(g);
      mark(g.home_team_espn_id, r);
      mark(g.away_team_espn_id, r);
    }
    const keys = [...rounds.keys()].sort((a, b) => a - b);
    return finish(keys.map((k) => ({ label: `Matchweek ${k}`, shortLabel: `MW ${k}`, games: rounds.get(k)!.sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime()), playoff: false })));
  }

  // Week buckets for the regular season, then playoff rounds in date order.
  const regular = sorted.filter((g) => !g.round);
  const playoffs = sorted.filter((g) => g.round);
  const groups: { label: string; shortLabel: string; games: GameRow[]; playoff: boolean }[] = [];

  if (regular.length) {
    const first = new Date(regular[0].date);
    // Anchor on the Wednesday before the opener (UTC) so Thursday-to-Tuesday NFL
    // weeks, or Monday-to-Sunday NBA weeks, never straddle a boundary.
    const anchor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()));
    const offsetToWed = (anchor.getUTCDay() - 3 + 7) % 7;
    anchor.setTime(anchor.getTime() - offsetToWed * DAY);
    const buckets = new Map<number, GameRow[]>();
    for (const g of regular) {
      const w = Math.floor((new Date(g.date).getTime() - anchor.getTime()) / (7 * DAY)) + 1;
      if (!buckets.has(w)) buckets.set(w, []);
      buckets.get(w)!.push(g);
    }
    for (const w of [...buckets.keys()].sort((a, b) => a - b)) {
      groups.push({ label: `Week ${w}`, shortLabel: `Wk ${w}`, games: buckets.get(w)!, playoff: false });
    }
  }

  if (playoffs.length) {
    const byRound = new Map<string, GameRow[]>();
    for (const g of playoffs) {
      const label = playoffRoundLabel(g.round!);
      if (!byRound.has(label)) byRound.set(label, []);
      byRound.get(label)!.push(g);
    }
    const ordered = [...byRound.entries()].sort((a, b) => new Date(a[1][0].date).getTime() - new Date(b[1][0].date).getTime());
    for (const [label, gs] of ordered) groups.push({ label, shortLabel: label.replace("Conference Championships", "Conf. Champ."), games: gs, playoff: true });
  }

  return finish(groups);
}

/** The week containing today, else the next one up, else the last played. */
export function currentWeekIndex(weeks: Matchweek[], now = Date.now()): number {
  if (weeks.length === 0) return 1;
  for (const w of weeks) {
    const start = new Date(w.start).getTime() - DAY;
    const end = new Date(w.end).getTime() + DAY;
    if (now >= start && now <= end) return w.index;
  }
  const upcoming = weeks.find((w) => new Date(w.start).getTime() > now);
  return upcoming ? upcoming.index : weeks[weeks.length - 1].index;
}

export function weekDateRange(w: Matchweek): string {
  return fmtRange(w.start, w.end);
}

/* ------------------------------------------------------------------------ */
/* Week summary, table after the week, top performers                        */
/* ------------------------------------------------------------------------ */

export interface WeekSummary {
  played: number;
  scheduled: number;
  totalScore: number;
  homeWins: number;
  awayWins: number;
  draws: number;
  biggest: GameRow | null;
  highest: GameRow | null;
}

export function summarizeWeek(week: Matchweek): WeekSummary {
  const done = week.games.filter((g) => g.completed && g.home_score != null && g.away_score != null);
  let totalScore = 0;
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let biggest: GameRow | null = null;
  let highest: GameRow | null = null;
  for (const g of done) {
    const h = g.home_score!;
    const a = g.away_score!;
    totalScore += h + a;
    if (h > a) homeWins++;
    else if (a > h) awayWins++;
    else draws++;
    if (!biggest || Math.abs(h - a) > Math.abs(biggest.home_score! - biggest.away_score!)) biggest = g;
    if (!highest || h + a > highest.home_score! + highest.away_score!) highest = g;
  }
  return { played: done.length, scheduled: week.games.length - done.length, totalScore, homeWins, awayWins, draws, biggest, highest };
}

export interface TableMovementRow extends ComputedTableRow {
  position: number;
  previousPosition: number | null;
  movement: number;
}

function toResults(games: GameRow[]): ResultRow[] {
  return games
    .filter((g) => g.completed && g.home_score != null && g.away_score != null)
    .map((g) => ({
      espn_id: g.espn_id,
      date: g.date,
      season_year: g.season_year,
      round: g.round,
      home_team_espn_id: g.home_team_espn_id,
      away_team_espn_id: g.away_team_espn_id,
      home_score: g.home_score!,
      away_score: g.away_score!,
    }));
}

function teamMapFromGames(games: GameRow[]): Map<string, TeamRef> {
  const m = new Map<string, TeamRef>();
  for (const g of games) {
    m.set(g.home_team_espn_id, { espn_id: g.home_team_espn_id, name: g.home_name, slug: g.home_slug, abbreviation: g.home_abbr, logo_url: g.home_logo, color: g.home_color });
    m.set(g.away_team_espn_id, { espn_id: g.away_team_espn_id, name: g.away_name, slug: g.away_slug, abbreviation: g.away_abbr, logo_url: g.away_logo, color: g.away_color });
  }
  return m;
}

/** Regular-season table after week `index`, with movement versus the week before. */
export function tableAfterWeek(league: League, weeks: Matchweek[], index: number): TableMovementRow[] {
  const regular = weeks.filter((w) => !w.playoff);
  const upTo = regular.filter((w) => w.index <= index).flatMap((w) => w.games);
  const before = regular.filter((w) => w.index < index).flatMap((w) => w.games);
  if (upTo.length === 0) return [];
  const teams = teamMapFromGames(regular.flatMap((w) => w.games));
  const now = computeTable(league, toResults(upTo), teams, "overall");
  const prev = computeTable(league, toResults(before), teams, "overall");
  const prevPos = new Map(prev.map((r, i) => [r.team.espn_id, i + 1]));
  return now.map((r, i) => {
    const p = prevPos.get(r.team.espn_id) ?? null;
    return { ...r, position: i + 1, previousPosition: p, movement: p ? p - (i + 1) : 0 };
  });
}

export interface PerformerBoard {
  title: string;
  unit: string;
  rows: { name: string; slug: string; headshot_url: string | null; team_name: string | null; team_abbr: string | null; value: number; game_espn_id: string }[];
}

const PERFORMER_CONFIG: Partial<Record<League, { category: string; label: string; title: string; unit: string }[]>> = {
  epl: [
    { category: "match", label: "G", title: "Goals", unit: "G" },
    { category: "match", label: "A", title: "Assists", unit: "A" },
    { category: "match", label: "SOG", title: "Shots on target", unit: "SOT" },
  ],
  laliga: [
    { category: "match", label: "G", title: "Goals", unit: "G" },
    { category: "match", label: "A", title: "Assists", unit: "A" },
    { category: "match", label: "SOG", title: "Shots on target", unit: "SOT" },
  ],
  nfl: [
    { category: "passing", label: "YDS", title: "Passing yards", unit: "YDS" },
    { category: "rushing", label: "YDS", title: "Rushing yards", unit: "YDS" },
    { category: "receiving", label: "YDS", title: "Receiving yards", unit: "YDS" },
  ],
};

export async function getWeekPerformers(league: League, week: Matchweek, limit = 5): Promise<PerformerBoard[]> {
  const config = PERFORMER_CONFIG[league];
  if (!config || week.games.length === 0) return [];
  const ids = week.games.filter((g) => g.completed).map((g) => g.espn_id);
  if (ids.length === 0) return [];
  const { rows } = await pool.query(
    `select pgs.game_espn_id, pgs.stats, p.name, p.slug, p.headshot_url, t.name as team_name, t.abbreviation as team_abbr
     from player_game_stats pgs
     join players p on p.league = pgs.league and p.espn_id = pgs.player_espn_id
     left join teams t on t.league = pgs.league and t.espn_id = pgs.team_espn_id
     where pgs.league = $1 and pgs.game_espn_id = any($2)`,
    [league, ids]
  );
  if (rows.length === 0) return [];

  return config
    .map((c) => {
      const list = rows
        .map((r) => {
          const raw = r.stats?.[c.category]?.[c.label];
          const value = raw == null ? NaN : Number(String(raw).replace(/,/g, ""));
          return { name: r.name, slug: r.slug, headshot_url: r.headshot_url, team_name: r.team_name, team_abbr: r.team_abbr, value, game_espn_id: r.game_espn_id };
        })
        .filter((r) => Number.isFinite(r.value) && r.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
      return { title: c.title, unit: c.unit, rows: list };
    })
    .filter((b) => b.rows.length > 0);
}
