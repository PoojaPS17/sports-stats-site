import type { GameRow } from "./queries";

export interface PlayoffResult {
  round: string;
  date: string;
  winnerName: string;
  winnerSlug: string;
  loserName: string;
  loserSlug: string;
  resultText: string;
}

function normalizeRoundKey(round: string): string {
  return round
    .replace(/\s*-\s*game\s*\d+\s*$/i, "")
    .trim()
    .toLowerCase();
}

function displayRound(round: string): string {
  return round.replace(/\s*-\s*game\s*\d+\s*$/i, "").trim();
}

// Groups a season's round-tagged games into distinct matchups — a round name alone
// isn't unique (e.g. NBA's "West 1st Round" happens 4 times at once, between 4
// different pairs of teams, and even a single-elimination round repeats the same
// label across games in a best-of-N series), so the group key is round + which two
// teams actually played, not the round name by itself.
export function summarizePlayoffs(games: GameRow[]): PlayoffResult[] {
  const groups = new Map<string, GameRow[]>();
  for (const g of games) {
    if (!g.round || /^Match \d+$/i.test(g.round)) continue;
    const pairKey = [g.home_team_espn_id, g.away_team_espn_id].sort().join("-");
    const key = `${normalizeRoundKey(g.round)}|${pairKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(g);
  }

  const results: PlayoffResult[] = [];
  for (const seriesGames of groups.values()) {
    seriesGames.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const last = seriesGames[seriesGames.length - 1];

    const wins = new Map<string, number>();
    const teamMeta = new Map<string, { name: string; slug: string }>();
    for (const g of seriesGames) {
      teamMeta.set(g.home_team_espn_id, { name: g.home_name, slug: g.home_slug });
      teamMeta.set(g.away_team_espn_id, { name: g.away_name, slug: g.away_slug });
      const homeWon = g.home_winner ?? (g.home_score ?? 0) > (g.away_score ?? 0);
      const awayWon = g.away_winner ?? (g.away_score ?? 0) > (g.home_score ?? 0);
      if (homeWon) wins.set(g.home_team_espn_id, (wins.get(g.home_team_espn_id) ?? 0) + 1);
      if (awayWon) wins.set(g.away_team_espn_id, (wins.get(g.away_team_espn_id) ?? 0) + 1);
    }

    const [teamAId, teamBId] = [...teamMeta.keys()];
    if (!teamAId || !teamBId) continue;
    const winsA = wins.get(teamAId) ?? 0;
    const winsB = wins.get(teamBId) ?? 0;
    const winnerId = winsA >= winsB ? teamAId : teamBId;
    const loserId = winnerId === teamAId ? teamBId : teamAId;
    const winner = teamMeta.get(winnerId)!;
    const loser = teamMeta.get(loserId)!;
    const winnerWins = wins.get(winnerId) ?? 0;
    const loserWins = wins.get(loserId) ?? 0;

    let resultText: string;
    if (seriesGames.length > 1) {
      resultText = `won the series ${winnerWins}-${loserWins}`;
    } else if (last.status_summary) {
      // Cricket's scoreboard-sourced games already carry a human summary like
      // "RCB won by 5 wkts" — nothing to derive.
      resultText = last.status_summary;
    } else {
      const winnerScore = last.home_team_espn_id === winnerId ? last.home_score_display ?? last.home_score : last.away_score_display ?? last.away_score;
      const loserScore = last.home_team_espn_id === loserId ? last.home_score_display ?? last.home_score : last.away_score_display ?? last.away_score;
      resultText = `won ${winnerScore}-${loserScore}`;
    }

    results.push({
      round: displayRound(last.round ?? ""),
      date: last.date,
      winnerName: winner.name,
      winnerSlug: winner.slug,
      loserName: loser.name,
      loserSlug: loser.slug,
      resultText,
    });
  }

  results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return results;
}
