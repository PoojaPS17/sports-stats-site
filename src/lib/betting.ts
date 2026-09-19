// SportsDB carries no betting content (see Terms, section 8). Two feeds bring it in
// from outside: ESPN's news headlines (betting guides, odds round-ups) and the App
// Store's sports chart (sportsbook and casino apps). Both are screened with the word
// lists below, at fetch time and again at read time so rows stored earlier are covered.
// Pure, so it is safe to import from scripts and client components alike.

// Whole words, any language the feeds use. Over-matching is fine: losing the odd
// harmless headline ("a bet between team-mates") costs nothing.
const WORDS = [
  "bet", "bets", "betting", "bettor", "bettors", "odds", "sportsbook", "sportsbooks", "wager", "wagers", "wagering",
  "parlay", "parlays", "moneyline", "gambling", "casino", "cassino", "poker", "aposta", "apostas", "apuesta", "apuestas",
  "prediction market", "draftkings", "fanduel", "prizepicks", "betmgm", "bet365", "betano", "pointsbet", "sportsbet",
  "superbet", "winamax", "paddy power", "midnite", "novig",
];

// App names only: fine as a headline word ("spin bowling"), a giveaway on an app.
const APP_WORDS = ["spin", "slots", "rummy", "teen patti", "lottery", "jackpot"];

const pattern = (words: string[]) => words.map((w) => w.replace(/ /g, "\\s+")).join("|");

const TEXT_RE = new RegExp(`\\b(${pattern(WORDS)})\\b`, "i");
const APP_RE = new RegExp(`\\b(${pattern([...WORDS, ...APP_WORDS])})\\b`, "i");

export function isBettingText(...parts: (string | null | undefined)[]): boolean {
  return parts.some((p) => !!p && TEXT_RE.test(p));
}

export function isBettingApp(name: string | null | undefined, developer?: string | null): boolean {
  return [name, developer].some((p) => !!p && APP_RE.test(p));
}

/** The headline word list as a Postgres regex, for use with `!~*`. */
export const BETTING_TEXT_PG = `\\m(${pattern(WORDS)})\\M`;
