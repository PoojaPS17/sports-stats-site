// Matchweek / NFL-week hubs derived from the games archive. Nothing in the feed
// tags a game with its round, so rounds are reconstructed:
//   - soccer: rounds are found by walking matchdays and starting a new round when
//     teams repeat; stray rescheduled games go back to the earliest round neither
//     team has played in
//   - NFL: the official week number stored from the feed, then the playoff rounds
//   - NBA: seven-day periods from opening night, then the playoff rounds
import { pool } from "./db";
import { isRegularSeasonGame } from "./gameStage";
import { GAME_SELECT, type GameRow } from "./queries";
import { computeTable, isSoccer, type ComputedTableRow, type ResultRow, type TeamRef } from "./analytics";
import { isCupCompetition, isQualifyingRound, isSoccerLeague, type League } from "./leagues";
import { gameCalledOffLabel, isGameCalledOff } from "./gameStatus";

export interface Matchweek {
  /** 1-based position in the season; doubles as the URL segment. */
  index: number;
  label: string;
  shortLabel: string;
  start: string;
  end: string;
  games: GameRow[];
  /** Games finished. A postponed or cancelled game is not one of them; see calledOff and weekProgress. */
  completed: number;
  /** Games ESPN closed without playing (postponed, cancelled, abandoned, suspended); their replay is another game. */
  calledOff: number;
  playoff: boolean;
  /** False when the round could not be numbered reliably and is labelled by its dates instead. */
  numbered: boolean;
}

export function supportsMatchweeks(league: League): boolean {
  return isSoccerLeague(league) || league === "nfl" || league === "nba";
}

export function weekNoun(league: League): string {
  return isCupCompetition(league) ? "Matchday" : isSoccer(league) ? "Matchweek" : "Week";
}

/** URL segment: /epl/matchweek, /ucl/matchday, /nfl/week (all served by the matchweek route via rewrites). */
function weekSegment(league: League): string {
  return isCupCompetition(league) ? "matchday" : isSoccer(league) ? "matchweek" : "week";
}

/** Public path for a week hub: /epl/matchweek/5, /nfl/week/3, /nfl/week/2025/3. */
export function weekPath(league: League, index: number, season?: number | null): string {
  const seg = weekSegment(league);
  return season ? `/${league}/${seg}/${season}/${index}` : `/${league}/${seg}/${index}`;
}

export function weekIndexPath(league: League, season?: number | null): string {
  const seg = weekSegment(league);
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
// A cup's stages have no conference: "Semifinals - 2nd Leg" → "Semifinals", and the
// Champions League's "Knockout Playoffs" keeps its name.
function playoffRoundLabel(round: string): string {
  const conference = /^(AFC|NFC|East|West)\b/i.test(round);
  const r = round
    .replace(/\s*-\s*(Game\s*\d+|(1st|2nd)\s+Leg)$/i, "")
    .replace(/^(AFC|NFC|East|West)\s+/i, "")
    .replace(/(?<!knockout)\s+Playoffs$/i, "")
    .trim();
  if (/championship/i.test(r)) return "Conference Championships";
  if (/^1st round$/i.test(r)) return "First Round";
  if (/^semifinals$/i.test(r)) return conference ? "Conference Semifinals" : "Semifinals";
  if (/^finals$/i.test(r)) return conference ? "Conference Finals" : "Finals";
  if (/^nba finals$/i.test(r)) return "Finals";
  return r;
}

function finish(groups: { label: string; shortLabel: string; games: GameRow[]; playoff: boolean; numbered?: boolean }[]): Matchweek[] {
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
        completed: g.games.filter((x) => x.completed && !isGameCalledOff(x)).length,
        calledOff: g.games.filter(isGameCalledOff).length,
        playoff: g.playoff,
        numbered: g.numbered ?? true,
      };
    });
}

// Knockout rounds, grouped by stage in date order (both legs of a tie together).
function playoffGroups(playoffs: GameRow[]): { label: string; shortLabel: string; games: GameRow[]; playoff: boolean }[] {
  const byRound = new Map<string, GameRow[]>();
  for (const g of playoffs) {
    // A scheduled postseason game can have no round yet (stage is playoffs, the notes headline is missing).
    const label = playoffRoundLabel(g.round ?? "Playoffs");
    if (!byRound.has(label)) byRound.set(label, []);
    byRound.get(label)!.push(g);
  }
  const ordered = [...byRound.entries()].sort((a, b) => new Date(a[1][0].date).getTime() - new Date(b[1][0].date).getTime());
  return ordered.map(([label, gs]) => ({ label, shortLabel: label.replace("Conference Championships", "Conf. Champ."), games: gs, playoff: true }));
}

export function buildMatchweeks(league: League, games: GameRow[]): Matchweek[] {
  if (games.length === 0) return [];
  const all = [...games].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  // A cup's knockout games carry their stage; only the league phase is numbered.
  const cup = isCupCompetition(league);
  const sorted = cup ? all.filter((g) => !g.round) : all;
  const knockouts = cup ? all.filter((g) => g.round && !isQualifyingRound(g.round)) : [];

  if (isSoccer(league)) {
    if (sorted.length === 0) return finish(playoffGroups(knockouts));
    // 1. Walk the season day by day. A day whose teams have already appeared in the
    //    current round starts a new round, provided it is a real matchday (3+ games).
    //    A day with only one or two such games is a stray: a Friday opener before
    //    the weekend proper, or a rescheduled fixture squeezed into a midweek.
    // Use the kickoff as first scheduled (before any postponement) where we have it,
    // so a rescheduled game is grouped with the round it was originally part of.
    const scheduled = (g: GameRow) => new Date(g.first_seen_date ?? g.date).getTime();
    const byDay = new Map<string, GameRow[]>();
    for (const g of [...sorted].sort((a, b) => scheduled(a) - scheduled(b))) {
      const key = new Date(scheduled(g)).toISOString().slice(0, 10);
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
    let roundStart = 0;
    const MIN_MATCHDAY = 3;
    // A round never spans more than a few days (Friday to Monday, or Tuesday to
    // Thursday). A real matchday starting five or more days after the round began is
    // the next round even when none of its teams collide, which happens after a cup
    // weekend leaves several teams without a league game.
    const MAX_ROUND_SPAN = 5 * DAY;
    for (const [day, games] of byDay) {
      const dayTime = new Date(day).getTime();
      const collides = (g: GameRow) => roundTeams.has(g.home_team_espn_id) || roundTeams.has(g.away_team_espn_id);
      const anyCollision = games.some(collides);
      const isMatchday = games.length >= MIN_MATCHDAY;
      let stale = mainIndex > 0 && dayTime - roundStart >= MAX_ROUND_SPAN;
      if (mainIndex === 0 || (isMatchday && (anyCollision || stale))) {
        mainIndex++;
        roundTeams = new Set();
        roundStart = dayTime;
        stale = false;
      }
      for (const g of games) {
        // A one- or two-game day is a stray when its teams already played this round,
        // or when it falls well after the round began (a Friday opener of the next
        // round whose teams happen to be free because their game was postponed).
        if (mainIndex > 0 && !isMatchday && (stale || (anyCollision && collides(g)))) {
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
    // 3. Stray games go to the round, among those neither team has played in, whose
    //    dates sit closest to the game's own scheduled date. A Friday opener lands in
    //    the weekend that follows it; a fixture postponed from October to March still
    //    returns to its October round, because that is the only free slot both teams
    //    share. Rounds are given a date range from their games (estimated at seven-day
    //    spacing for rounds that have none yet).
    const roundRange = (r: number): [number, number] | null => {
      const gs = rounds.get(r);
      if (!gs || gs.length === 0) return null;
      const ts = gs.map(scheduled);
      return [Math.min(...ts), Math.max(...ts)];
    };
    const estimateStart = (r: number): number => {
      const known = [...rounds.keys()].filter((k) => rounds.get(k)!.length > 0).sort((a, b) => a - b);
      if (known.length === 0) return 0;
      const before = [...known].reverse().find((k) => k < r);
      const after = known.find((k) => k > r);
      if (before !== undefined) return roundRange(before)![0] + (r - before) * 7 * DAY;
      return roundRange(after!)![0] - (after! - r) * 7 * DAY;
    };
    const distance = (r: number, t: number): number => {
      const range = roundRange(r);
      if (range) return t < range[0] ? range[0] - t : t > range[1] ? t - range[1] : 0;
      return Math.abs(t - estimateStart(r));
    };
    for (const { g } of loose) {
      const a = used.get(g.home_team_espn_id) ?? new Set<number>();
      const b = used.get(g.away_team_espn_id) ?? new Set<number>();
      const t = scheduled(g);
      const maxRound = Math.max(mainIndex, ...rounds.keys());
      let best = -1;
      let bestDistance = Infinity;
      // Only rounds the season already has are candidates; a brand-new round is a last
      // resort (a postponed fixture always has its original round free for both sides).
      for (let r = 1; r <= maxRound; r++) {
        if (a.has(r) || b.has(r)) continue;
        const d = distance(r, t);
        if (d < bestDistance) {
          bestDistance = d;
          best = r;
        }
      }
      const r = best === -1 ? maxRound + 1 : best;
      if (!rounds.has(r)) rounds.set(r, []);
      rounds.get(r)!.push(g);
      mark(g.home_team_espn_id, r);
      mark(g.away_team_espn_id, r);
    }
    const keys = [...rounds.keys()].sort((a, b) => a - b);
    const byDate = (x: GameRow, y: GameRow) => new Date(x.date).getTime() - new Date(y.date).getTime();
    // Only publish "Matchweek N" when the reconstruction is airtight: no more rounds
    // than the season has, no round with more games than half the league, and no
    // team twice in a round. Otherwise label rounds by their dates so nothing false
    // is shown.
    const teamCount = new Set(sorted.flatMap((g) => [g.home_team_espn_id, g.away_team_espn_id])).size;
    const exact =
      keys.length <= Math.max(1, teamCount * 2 - 2) &&
      keys.every((k) => {
        const gs = rounds.get(k)!;
        const ids = gs.flatMap((g) => [g.home_team_espn_id, g.away_team_espn_id]);
        return gs.length <= Math.floor(teamCount / 2) && new Set(ids).size === ids.length;
      });
    const noun = weekNoun(league);
    const short = cup ? "MD" : "MW";
    return finish([
      ...keys.map((k) => {
        const games = rounds.get(k)!.sort(byDate);
        if (exact) return { label: `${noun} ${k}`, shortLabel: `${short} ${k}`, games, playoff: false, numbered: true };
        const range = fmtRange(games[0].date, games[games.length - 1].date);
        return { label: `Games of ${range}`, shortLabel: range.split(/[–-]/)[0].trim(), games, playoff: false, numbered: false };
      }),
      ...playoffGroups(knockouts),
    ]);
  }

  // Week buckets for the regular season, then playoff rounds in date order.
  // The play-in, preseason and other games that do not count belong to neither.
  const regular = sorted.filter(isRegularSeasonGame);
  // A row typed "other" (or with no stage) that carries a round is a playoff row, as it was before
  // stages existed; regular, play-in and excluded rows never are.
  const playoffs = sorted.filter((g) => g.stage === "playoffs" || ((!g.stage || g.stage === "other") && Boolean(g.round)));
  const groups: { label: string; shortLabel: string; games: GameRow[]; playoff: boolean }[] = [];

  if (regular.length && regular.every((g) => g.week != null)) {
    // Official week numbers from the feed (NFL).
    const byWeek = new Map<number, GameRow[]>();
    for (const g of regular) {
      if (!byWeek.has(g.week!)) byWeek.set(g.week!, []);
      byWeek.get(g.week!)!.push(g);
    }
    for (const w of [...byWeek.keys()].sort((a, b) => a - b)) {
      groups.push({ label: `Week ${w}`, shortLabel: `Wk ${w}`, games: byWeek.get(w)!, playoff: false });
    }
  } else if (regular.length) {
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

  groups.push(...playoffGroups(playoffs));

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
  /** Games still to be played: neither finished nor called off. */
  scheduled: number;
  /** Games in the week that were postponed, cancelled, abandoned or suspended. */
  calledOff: number;
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
  const calledOff = week.calledOff;
  return { played: done.length, scheduled: week.games.length - done.length - calledOff, calledOff, totalScore, homeWins, awayWins, draws, biggest, highest };
}

/** "1 postponed", "2 cancelled", or "2 called off" when the reasons differ; null when nothing in the week was called off. */
export function calledOffNote(week: Matchweek): string | null {
  const labels = week.games.map(gameCalledOffLabel).filter((l): l is string => l !== null);
  if (labels.length === 0) return null;
  const same = new Set(labels).size === 1;
  return same ? `${labels.length} ${labels[0].toLowerCase()}` : `${labels.length} called off`;
}

/**
 * How far through a week is. A called-off game is resolved (its replay is another game), so it neither holds a
 * finished week open nor counts toward the games still to play.
 */
export function weekProgress(week: Pick<Matchweek, "games" | "completed" | "calledOff">): {
  played: number;
  toPlay: number;
  state: "done" | "partial" | "pending" | "off";
} {
  const toPlay = week.games.length - week.calledOff;
  const state = toPlay === 0 ? "off" : week.completed >= toPlay ? "done" : week.completed > 0 ? "partial" : "pending";
  return { played: week.completed, toPlay, state };
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
      stage: g.stage,
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
  bundesliga: [
    { category: "match", label: "G", title: "Goals", unit: "G" },
    { category: "match", label: "A", title: "Assists", unit: "A" },
    { category: "match", label: "SOG", title: "Shots on target", unit: "SOT" },
  ],
  seriea: [
    { category: "match", label: "G", title: "Goals", unit: "G" },
    { category: "match", label: "A", title: "Assists", unit: "A" },
    { category: "match", label: "SOG", title: "Shots on target", unit: "SOT" },
  ],
  ucl: [
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
    `select pgs.game_espn_id, pgs.stats, p.name, p.slug, coalesce(p.headshot_url, p.photo_url) as headshot_url, t.name as team_name, t.abbreviation as team_abbr
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
