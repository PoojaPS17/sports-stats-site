// Who won a cricket match, from what the feeds actually say.
//
// ESPN's competitor `winner` flags are the first choice, but they are missing on
// the summary copy the international importer reads (both sides null) and are
// false/false for a tie that a super over then decided — which the site would show
// as a draw and a team's record would count as neither win nor loss. The status
// summary ("SA Women won by 16 runs", "Match tied (KKR won the Super Over)",
// "UGA Women awarded the match") always names the outcome, so it settles the flags
// when they do not.

export interface CricketSide {
  name: string | null | undefined;
  abbreviation?: string | null;
  /** The score line; a chasing side's carries "target" ("157/3 (17.4/20 ov, target 157)"). */
  score?: string | null;
}

export interface WinnerFlags {
  home: boolean | null;
  away: boolean | null;
}

function tokens(s: string): string[] {
  return s
    .replace(/\./g, "")
    .replace(/-W\b/i, "")
    .replace(/\b(Women|Womwn|Wmn|W)\b/gi, " ")
    .replace(/\bXI\b/gi, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

// Does the summary's name for a side ("KKR", "Scorchers", "U.S.A.", "SA Women",
// "Kings XI") point at this team? Abbreviation match, whole-name match, or a shared
// distinctive word (three letters or more).
function namesSide(label: string, side: CricketSide): boolean {
  const want = tokens(label);
  if (want.length === 0) return false;
  const abbr = tokens(side.abbreviation ?? "").join("");
  const name = tokens(side.name ?? "");
  if (abbr && want.join("") === abbr) return true;
  if (want.join(" ") === name.join(" ")) return true;
  return want.some((w) => w.length >= 3 && name.includes(w));
}

function pick(label: string, home: CricketSide, away: CricketSide): WinnerFlags | null {
  const h = namesSide(label, home);
  const a = namesSide(label, away);
  if (h === a) return null;
  return { home: h, away: a };
}

/**
 * Winner flags for a finished match. Returns the feed's own flags when they name
 * exactly one winner; otherwise derives them from the summary; null/null when the
 * match had no result or the summary cannot be read; false/false for a plain tie.
 */
export function resolveCricketWinner(summary: string | null | undefined, home: CricketSide, away: CricketSide, feed: WinnerFlags = { home: null, away: null }): WinnerFlags {
  if (feed.home === true && feed.away !== true) return { home: true, away: false };
  if (feed.away === true && feed.home !== true) return { home: false, away: true };
  const text = (summary ?? "").trim();
  if (!text) return feed;
  if (/no result|abandon|cancel|postpon/i.test(text)) return { home: null, away: null };

  // "X won by N wkts/runs": the chasing side (its score carries the target) wins by
  // wickets, the side that batted first wins by runs. This needs no name matching.
  const margin = /won by \d+ (wkts?|wickets?|runs?)\b/i.exec(text);
  const homeChased = /target/i.test(home.score ?? "");
  const awayChased = /target/i.test(away.score ?? "");
  if (margin && homeChased !== awayChased) {
    const chaserWon = /wkt|wicket/i.test(margin[1]);
    const homeWon = chaserWon ? homeChased : awayChased;
    return { home: homeWon, away: !homeWon };
  }

  // "Match tied (KKR won the Super Over)", "England won the boundary count",
  // "UGA Women awarded the match", "Kenya won (match awarded)", "X won by 5 wkts".
  const named =
    /\(\s*(.+?)\s+won\b/i.exec(text)?.[1] ??
    /^(.+?)\s+(?:were |was )?awarded\b/i.exec(text)?.[1] ??
    /^(.+?)\s+won\b/i.exec(text)?.[1] ??
    null;
  if (named) {
    const flags = pick(named, home, away);
    if (flags) return flags;
  }
  if (/\btied?\b/i.test(text) || /\bdraw/i.test(text)) return { home: false, away: false };
  return feed;
}
