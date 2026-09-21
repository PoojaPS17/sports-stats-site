// The strip of latest results under the header. It is fetched by the browser from
// /api/ticker rather than rendered into the root layout: a layout that queries the
// database makes every page on the site re-render whenever a score changes, and that
// is what burned through the host's page-regeneration allowance.
import { getTickerGames, getLastUpdated, LEAGUE_LABEL, isCricketLeague, isSoccerLeague } from "./queries";
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
  const date = formatGameDate(g.date, g.league, { month: "short", day: "numeric" });
  return {
    href: `/${g.league}/games/${g.espn_id}`,
    label: isSoccerLeague(g.league)
      ? `${league} · ${teamDisplayName(g.home_name)} v ${teamDisplayName(g.away_name)}, ${date}`
      : `${league} · ${teamDisplayName(g.away_name)} at ${teamDisplayName(g.home_name)}, ${date}`,
  };
}

export async function getTicker(): Promise<{ items: TickerItem[]; updatedAt: string | null }> {
  const [games, updatedAt] = await Promise.all([getTickerGames(10), getLastUpdated()]);
  return { items: games.map(tickerLabel), updatedAt };
}
