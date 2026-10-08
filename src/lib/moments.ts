// "Moments you missed": the finished results of the teams a visitor follows since they last looked.
// Every figure is read from a stored, finished game; nothing is estimated. A game counts when it is
// complete, was not called off, and carries a score (cricket: a result the site can read); anything
// else is left out rather than guessed at.
import type { Moment, MomentsBlockData } from "./blockTypes";
import { MOMENTS_LOOKBACK_DAYS } from "./blockParams";
import { cricketResultLine, resolveCricketWinner, type CricketSide } from "./cricketResult";
import { getCricketSideResults } from "./cricketSeries";
import { pool } from "./db";
import { isGameCalledOff } from "./gameStatus";
import { isCricketLeague, isLeague } from "./leagues";
import { GAME_SELECT, type GameRow } from "./queries";
import { teamDisplayName } from "./teamName";

/** The most moments one response carries; `total` still counts them all. */
export const MOMENT_CAP = 5;

const DAY_MS = 86_400_000;

export interface FollowedTeam {
  /** A league key, or "cricket" for a cricket side. */
  league: string;
  /** A team slug, or a cricket side id. */
  team: string;
}

/** "epl:arsenal,cricket:6" to its entries, in order. Entries are validated by validateBlockParams already. */
export function parseTeams(teams: string): FollowedTeam[] {
  return teams
    .split(",")
    .map((entry) => entry.split(":"))
    .filter((p) => p.length === 2 && p[0] && p[1])
    .map(([league, team]) => ({ league, team }));
}

/** The window's start: the visitor's last visit, but never more than seven days before `now`. */
export function windowStart(sinceSeconds: number, now: Date): Date {
  return new Date(Math.max(sinceSeconds * 1000, now.getTime() - MOMENTS_LOOKBACK_DAYS * DAY_MS));
}

// "157/3 (17.4/20 ov, target 157)" is "157/3" in a line; a Test innings pair ("312 & 120/3") is left whole.
const cleanScore = (s: string | null | undefined): string | null => {
  const t = (s ?? "").replace(/\s*\(.*\)\s*$/, "").trim();
  return t || null;
};

function cricketMoment(args: {
  id: string;
  date: string;
  me: CricketSide & { winner?: boolean | null };
  them: CricketSide & { winner?: boolean | null };
  meIsHome: boolean;
  summary: string | null;
  href: string;
  league: string;
}): Moment | null {
  const { me, them, meIsHome } = args;
  const home = meIsHome ? me : them;
  const away = meIsHome ? them : me;
  const line = cricketResultLine(home, away, args.summary);
  if (!line) return null;
  const flags = resolveCricketWinner(args.summary, home, away, { home: home.winner ?? null, away: away.winner ?? null });
  // No result (both null) is not a win, loss or draw: it is left out.
  if (flags.home === null && flags.away === null) return null;
  const mineWon = meIsHome ? flags.home : flags.away;
  const theirsWon = meIsHome ? flags.away : flags.home;
  const mine = cleanScore(me.score);
  const theirs = cleanScore(them.score);
  return {
    id: `cricket/${args.id}`,
    date: args.date,
    team: me.name ?? "",
    opponent: teamDisplayName(them.name ?? ""),
    home: meIsHome,
    score: mine && theirs ? `${mine} v ${theirs}` : null,
    result: mineWon ? "W" : theirsWon ? "L" : "D",
    summary: line,
    href: args.href,
    league: args.league,
  };
}

function gameMoment(g: GameRow, meIsHome: boolean): Moment | null {
  if (!g.completed || isGameCalledOff(g)) return null;
  const iso = new Date(g.date).toISOString();
  const myName = teamDisplayName(meIsHome ? g.home_name : g.away_name);
  const theirName = teamDisplayName(meIsHome ? g.away_name : g.home_name);
  if (isCricketLeague(g.league)) {
    const side = (home: boolean): CricketSide & { winner: boolean | null } => ({
      name: home ? g.home_name : g.away_name,
      abbreviation: home ? g.home_abbr : g.away_abbr,
      score: home ? g.home_score_display : g.away_score_display,
      winner: home ? g.home_winner : g.away_winner,
    });
    return cricketMoment({ id: g.espn_id, date: iso, me: side(meIsHome), them: side(!meIsHome), meIsHome, summary: g.status_summary, href: `/${g.league}/games/${g.espn_id}`, league: g.league });
  }
  if (g.home_score === null || g.away_score === null) return null;
  const mine = meIsHome ? g.home_score : g.away_score;
  const theirs = meIsHome ? g.away_score : g.home_score;
  return {
    id: `${g.league}/${g.espn_id}`,
    date: iso,
    team: myName,
    opponent: theirName,
    home: meIsHome,
    score: `${mine}-${theirs}`,
    result: mine > theirs ? "W" : mine < theirs ? "L" : "D",
    summary: null,
    href: `/${g.league}/games/${g.espn_id}`,
    league: g.league,
  };
}

/**
 * The visitor's moments: finished results of the listed teams that started after `since` (and within the last
 * seven days), newest first, one per game even when two followed teams met, at most MOMENT_CAP of them.
 * A game between two followed teams is told from the side of the one listed first.
 */
export async function loadMoments(teams: FollowedTeam[], sinceSeconds: number, now = new Date()): Promise<MomentsBlockData> {
  const from = windowStart(sinceSeconds, now);
  const found = new Map<string, { moment: Moment; order: number }>();
  const keep = (moment: Moment | null, order: number) => {
    if (!moment) return;
    const had = found.get(moment.id);
    if (!had || order < had.order) found.set(moment.id, { moment, order });
  };

  if (from.getTime() < now.getTime()) {
    const byLeague = new Map<string, { team: string; order: number }[]>();
    teams.forEach(({ league, team }, order) => {
      if (league === "cricket" || !isLeague(league)) return;
      byLeague.set(league, [...(byLeague.get(league) ?? []), { team, order }]);
    });

    for (const [league, wanted] of byLeague) {
      const { rows: teamRows } = await pool.query<{ espn_id: string; slug: string }>(`select espn_id, slug from teams where league = $1 and slug = any($2::text[])`, [league, wanted.map((w) => w.team)]);
      const orderOf = new Map<string, number>(); // team espn id -> position in the visitor's list
      for (const t of teamRows) orderOf.set(t.espn_id, wanted.find((w) => w.team === t.slug)!.order);
      if (orderOf.size === 0) continue;
      const ids = [...orderOf.keys()];
      const { rows } = await pool.query<GameRow>(
        `${GAME_SELECT}
         where g.league = $1 and g.completed and g.date > $2 and g.date <= $3
           and (g.home_team_espn_id = any($4::text[]) or g.away_team_espn_id = any($4::text[]))
         order by g.date desc, g.espn_id`,
        [league, from, now, ids]
      );
      for (const g of rows) {
        const homeOrder = orderOf.get(g.home_team_espn_id);
        const awayOrder = orderOf.get(g.away_team_espn_id);
        // Both followed: tell it from the side listed first.
        const meIsHome = homeOrder !== undefined && (awayOrder === undefined || homeOrder <= awayOrder);
        keep(gameMoment(g, meIsHome), meIsHome ? homeOrder! : awayOrder!);
      }
    }

    const sides = teams.filter((t) => t.league === "cricket");
    if (sides.length > 0) {
      const matches = await getCricketSideResults(sides.map((s) => s.team), from);
      for (const m of matches) {
        if (!m.home || !m.away) continue;
        const homeOrder = sides.findIndex((s) => s.team === m.home!.id);
        const awayOrder = sides.findIndex((s) => s.team === m.away!.id);
        const meIsHome = homeOrder !== -1 && (awayOrder === -1 || homeOrder <= awayOrder);
        const me = meIsHome ? m.home : m.away;
        const them = meIsHome ? m.away : m.home;
        // A match that is also stored as a game under a cricket league has its page there; otherwise the match page.
        const href = m.scorecard_league ? `/${m.scorecard_league}/games/${m.espn_id}` : `/cricket/matches/${m.espn_id}`;
        keep(
          cricketMoment({ id: m.espn_id, date: new Date(m.date).toISOString(), me, them, meIsHome, summary: m.status_summary, href, league: "cricket" }),
          teams.findIndex((t) => t.league === "cricket" && t.team === me.id)
        );
      }
    }
  }

  const all = [...found.values()].map((f) => f.moment).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return { since: from.toISOString(), total: all.length, moments: all.slice(0, MOMENT_CAP) };
}
