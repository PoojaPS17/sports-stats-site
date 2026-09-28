// The strip of latest results under the header. It is fetched by the browser from
// /api/ticker rather than rendered into the root layout: a layout that queries the
// database makes every page on the site re-render whenever a score changes, and that
// is what burned through the host's page-regeneration allowance.
import { getTickerGames, getLastUpdated, LEAGUE_LABEL, isCricketLeague, type TickerGame } from "./queries";
import { gameSides } from "./gamePage";
import { formatGameDate } from "./gameDay";
import { teamDisplayName } from "./teamName";

export interface TickerItem {
  href: string;
  label: string;
}

function tickerLabel(g: Awaited<ReturnType<typeof getTickerGames>>[number]): TickerItem {
  const league = LEAGUE_LABEL[g.league];
  if (g.completed) {
    // Cricsheet-sourced cricket rows carry no winner flag; the summary names the winner.
    const summaryWinner = g.status_summary && isCricketLeague(g.league) ? (g.status_summary.startsWith(g.home_name) ? true : g.status_summary.startsWith(g.away_name) ? false : null) : null;
    const homeWon = g.home_winner ?? summaryWinner ?? (g.home_score ?? 0) > (g.away_score ?? 0);
    const winner = teamDisplayName(homeWon ? g.home_name : g.away_name);
    const loser = teamDisplayName(homeWon ? g.away_name : g.home_name);
    const winScore = homeWon ? g.home_score_display ?? g.home_score : g.away_score_display ?? g.away_score;
    const loseScore = homeWon ? g.away_score_display ?? g.away_score : g.home_score_display ?? g.home_score;
    // A cricket result is a margin ("won by 7 wickets"), never a scoreline; a tie or
    // no-result has no winner to name, so the feed's own summary stands.
    const margin = g.status_summary
      ?.match(/\bwon by (.+?)(?: \(.*\))?$/i)?.[1]
      .replace(/\bwkts?\b/i, (w) => (w.toLowerCase() === "wkt" ? "wicket" : "wickets"));
    const noWinner = g.home_winner === false && g.away_winner === false;
    const label = isCricketLeague(g.league)
      ? noWinner || !margin
        ? `${league} · ${teamDisplayName(g.status_summary ?? `${g.home_name} v ${g.away_name}`)}`
        : `${league} · ${winner} beat ${loser} by ${margin}`
      : `${league} · ${winner} beat ${loser} ${winScore}-${loseScore}`;
    return { href: `/${g.league}/games/${g.espn_id}`, label };
  }
  const date = formatGameDate(g.date, g.league, { month: "short", day: "numeric" }, g.local_date);
  // The order and joiner the match page's title uses: football and cricket name the home side first with "v" (a fixture
  // has no batting order yet, and this query carries no scorecard), the NBA and NFL the visitors first with "at".
  const { first, second, awayFirst } = gameSides(g.league, g);
  return {
    href: `/${g.league}/games/${g.espn_id}`,
    label: `${league} · ${teamDisplayName(first)} ${awayFirst ? "at" : "v"} ${teamDisplayName(second)}, ${date}`,
  };
}

export interface TickerSide {
  name: string;
  score: string | null;
  won: boolean;
}

export interface TickerChip extends TickerItem {
  league: string;
  live: boolean;
  upcoming: boolean;
  /** "Final", the clock ("Q3 4:12", "67'"), a cricket margin, or the kickoff date. */
  status: string;
  /** In display order: visitors first for the NBA and NFL, home first elsewhere; cricket by batting order. */
  sides: [TickerSide, TickerSide];
}

function side(name: string, abbr: string | null, score: number | null, display: string | null, won: boolean, showScore: boolean): TickerSide {
  return { name: abbr ?? teamDisplayName(name), score: showScore ? (display ?? (score !== null ? String(score) : null)) : null, won };
}

export function tickerChip(g: TickerGame): TickerChip {
  const { href, label } = tickerLabel(g);
  const live = g.status_state === "in";
  const upcoming = !g.completed && !live;
  const cricket = isCricketLeague(g.league);
  const homeWon = g.completed && (g.home_winner ?? (!cricket && (g.home_score ?? 0) > (g.away_score ?? 0)));
  const awayWon = g.completed && (g.away_winner ?? (!cricket && (g.away_score ?? 0) > (g.home_score ?? 0)));
  const home = side(g.home_name, g.home_abbr, g.home_score, g.home_score_display, homeWon, !upcoming);
  const away = side(g.away_name, g.away_abbr, g.away_score, g.away_score_display, awayWon, !upcoming);
  const { awayFirst } = gameSides(g.league, g);
  const sides: [TickerSide, TickerSide] = awayFirst ? [away, home] : [home, away];

  let status: string;
  if (live) status = g.status_detail ?? "Live";
  else if (upcoming) status = formatGameDate(g.date, g.league, { month: "short", day: "numeric" }, g.local_date);
  else if (cricket) status = g.status_summary?.match(/\bwon by (.+?)(?: \(.*\))?$/i)?.[0] ?? g.status_summary ?? "Result";
  else status = g.status_detail && /^final/i.test(g.status_detail) ? g.status_detail : "Final";

  return { href, label, league: LEAGUE_LABEL[g.league], live, upcoming, status, sides };
}

export async function getTicker(): Promise<{ items: TickerChip[]; updatedAt: string | null }> {
  const [games, updatedAt] = await Promise.all([getTickerGames(10), getLastUpdated()]);
  return { items: games.map(tickerChip), updatedAt };
}
