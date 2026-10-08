// Older stored scorecards (most Cricsheet-sourced ODIs and T20Is) carry no dismissal text, so a batter who finished
// unbeaten printed as "84" where the same match's ESPN-sourced copy (the World Cup's) says "84*". The per-player rows
// (player_game_stats) hold the not-out flag for every one of them, so the card is completed from those.
import type { CricketTeamScorecard } from "./matchDetail";

/** One player's stored match figures, as player_game_stats holds them. */
export interface StoredBatting {
  batting?: { notOut?: boolean };
  innings?: { n: number; batting?: { notOut?: boolean } }[];
}

/**
 * The scorecard with "not out" filled in on batting rows that have no dismissal text but whose stored innings was
 * unbeaten. A row that already has a dismissal is left exactly as it was; so is any row the stored figures do not
 * cover. Returns the same array when nothing changes.
 */
export function withStoredNotOuts(scorecard: CricketTeamScorecard[], stored: Map<string, StoredBatting>): CricketTeamScorecard[] {
  let changed = false;
  const out = scorecard.map((team) => ({
    ...team,
    battingRows: team.battingRows.map((row) => {
      if (row.dismissal || row.stats.length < 2) return row;
      const s = stored.get(row.athleteId);
      if (!s) return row;
      // A match of several innings (a Test) is matched by its innings number; a limited-overs match has one.
      const notOut = row.innings != null && s.innings?.length ? s.innings.find((i) => i.n === row.innings)?.batting?.notOut : s.innings?.length ? undefined : s.batting?.notOut;
      if (notOut !== true) return row;
      changed = true;
      return { ...row, dismissal: "not out" };
    }),
  }));
  return changed ? out : scorecard;
}
