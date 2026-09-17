import type { GameRow } from "./queries";
import { isQualifyingRound } from "./leagues";

export interface PlayoffResult {
  round: string;
  date: string;
  winnerName: string;
  winnerSlug: string;
  loserName: string;
  loserSlug: string;
  resultText: string;
}

// "- Game 3" (a best-of series) and "- 2nd Leg" (a two-legged cup tie) both name one
// meeting within the same round.
const MEETING_SUFFIX = /\s*-\s*(game\s*\d+|(1st|2nd)\s+leg)\s*$/i;

function normalizeRoundKey(round: string): string {
  return round.replace(MEETING_SUFFIX, "").trim().toLowerCase();
}

function displayRound(round: string): string {
  return round.replace(MEETING_SUFFIX, "").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A two-legged tie is decided on aggregate, not on legs won: 2-0 then 1-3 is 3-3 and
// goes to extra time and penalties, so the feed's own note on the second leg ("RMA
// advance 4-2 on penalties") is the only reliable statement of who went through.
function resolveTwoLeggedTie(
  legs: GameRow[],
  teamMeta: Map<string, { name: string; slug: string }>
): { winnerId: string; loserId: string; resultText: string } | null {
  const goals = new Map<string, number>();
  for (const g of legs) {
    goals.set(g.home_team_espn_id, (goals.get(g.home_team_espn_id) ?? 0) + (g.home_score ?? 0));
    goals.set(g.away_team_espn_id, (goals.get(g.away_team_espn_id) ?? 0) + (g.away_score ?? 0));
  }
  const [a, b] = [...teamMeta.keys()];
  const ga = goals.get(a) ?? 0;
  const gb = goals.get(b) ?? 0;
  const last = legs[legs.length - 1];
  const note = last.status_summary ?? "";
  if (ga !== gb) {
    const winnerId = ga > gb ? a : b;
    return { winnerId, loserId: winnerId === a ? b : a, resultText: `won ${Math.max(ga, gb)}-${Math.min(ga, gb)} on aggregate` };
  }
  // Level on aggregate: the note names the side that advanced, by name or abbreviation.
  const named = [a, b].find((id) => {
    const abbr = id === last.home_team_espn_id ? last.home_abbr : last.away_abbr;
    const tokens = [teamMeta.get(id)!.name, abbr].filter((t): t is string => Boolean(t)).map(escapeRegExp);
    return new RegExp(`\\b(${tokens.join("|")})\\b[^.]*advance`, "i").test(note);
  });
  if (!named) return null;
  const pens = note.match(/(\d+)\s*-\s*(\d+)\s+on\s+penalt/i);
  const how = pens ? `won ${pens[1]}-${pens[2]} on penalties` : /away goals/i.test(note) ? "advanced on away goals" : "advanced";
  return { winnerId: named, loserId: named === a ? b : a, resultText: `${how} after a ${ga}-${gb} aggregate` };
}

// Groups a season's round-tagged games into distinct matchups — a round name alone
// isn't unique (e.g. NBA's "West 1st Round" happens 4 times at once, between 4
// different pairs of teams, and even a single-elimination round repeats the same
// label across games in a best-of-N series), so the group key is round + which two
// teams actually played, not the round name by itself.
export function summarizePlayoffs(games: GameRow[]): PlayoffResult[] {
  const groups = new Map<string, GameRow[]>();
  for (const g of games) {
    if (!g.round || /^Match \d+$/i.test(g.round) || isQualifyingRound(g.round)) continue;
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
    const twoLegged = seriesGames.length === 2 && seriesGames.every((g) => /\bleg$/i.test(g.round ?? ""));
    if (twoLegged) {
      const tie = resolveTwoLeggedTie(seriesGames, teamMeta);
      // Without a decisive aggregate or a note naming the winner, say nothing rather
      // than guess.
      if (!tie) continue;
      const winner = teamMeta.get(tie.winnerId)!;
      const loser = teamMeta.get(tie.loserId)!;
      results.push({ round: displayRound(last.round ?? ""), date: last.date, winnerName: winner.name, winnerSlug: winner.slug, loserName: loser.name, loserSlug: loser.slug, resultText: tie.resultText });
      continue;
    }
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
