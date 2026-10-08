// Copy and links for the first-visit explainer modules (showcase, how it works, trust, start here). Pure: nothing here
// reaches the database or the network, and every claim is either static copy checked by tests/home-explainers.test.ts
// against the code it describes, or derived from a constant the site itself uses (archive start years, the story window,
// the scraper cadence). Anything that depends on stored data (the example links, the newest result) comes in as an argument
// and is left out when it is missing: a tile never links to a page it could not name.
import { archiveStartYear } from "./cricketCoverage";
import { STORY_FETCH_DAYS } from "./cricketBalls";
import { testsSince } from "./testArchiveCopy";

/** How often the stored results are refreshed: sportsdb-scrape-tick.timer runs `*:0/15` (a test reads the timer file). */
export const RESULTS_REFRESH_MINUTES = 15;

export type ShowcaseVisual = "story" | "splits" | "compare" | "cards" | "calendar" | "records";

export interface ShowcaseTile {
  id: ShowcaseVisual;
  title: string;
  text: string;
  link: { label: string; href: string };
}

/**
 * The featured match's page when it is a cricket match whose page draws the match story: one in play, or a finished one
 * within STORY_FETCH_DAYS (older archive pages get the hero only). Anything else is null, so the tile falls back to the series list.
 */
export function storyExampleHref(pick: { rule: string; mode: string; href: string; startIso: string | null }, now: Date = new Date()): string | null {
  if (pick.rule !== "chase" && pick.rule !== "cricket") return null;
  if (pick.mode === "live") return pick.href;
  if (pick.mode !== "latest" || !pick.startIso) return null;
  const age = now.getTime() - new Date(pick.startIso).getTime();
  return Number.isFinite(age) && age <= STORY_FETCH_DAYS * 86400000 ? pick.href : null;
}

export interface ExplainerExamples {
  /** A cricket match that is in play or finished (its page shows the match story), or null. */
  matchHref: string | null;
  /** A cricketer's page (the week's top performer) for the splits tile, or null. */
  cricketer: { name: string; href: string } | null;
  /** A league that has player comparison; the compare and share tiles link to it. */
  compareLeague: string;
}

/**
 * The six tiles under "Built from every result we store". The visuals are drawn shapes with no figures in them (an
 * invented number would be an invented claim); each text describes what the linked page really does.
 */
export function showcaseTiles(ex: ExplainerExamples): ShowcaseTile[] {
  return [
    {
      id: "story",
      title: "Every match as a story",
      text: `Runs by over for both sides with the wickets marked, on cricket matches in play or finished in the last ${STORY_FETCH_DAYS} days.`,
      link: ex.matchHref ? { label: "See a match story", href: ex.matchHref } : { label: "Cricket series", href: "/cricket/series" },
    },
    {
      id: "splits",
      title: "Splits by opponent and venue",
      text: "A cricketer's career figures cut by team, by opponent and by venue, over the matches held on this site.",
      link: ex.cricketer ? { label: `${ex.cricketer.name}'s splits`, href: ex.cricketer.href } : { label: "Cricket series", href: "/cricket/series" },
    },
    {
      id: "compare",
      title: "Compare any two players",
      text: "Pick two players in a league and see their statistics side by side, category by category.",
      link: { label: "Compare players", href: `/${ex.compareLeague}/compare/players` },
    },
    {
      id: "cards",
      title: "Share cards",
      text: "Standings, leaders, records and scorecards as an image you can share or download.",
      link: { label: "Make one from the leaders", href: `/${ex.compareLeague}/leaders` },
    },
    {
      id: "calendar",
      title: "Fixtures in your calendar",
      text: "One calendar feed for the teams you follow. Scores are added to the event titles as games finish.",
      link: { label: "Your follows", href: "/following" },
    },
    {
      id: "records",
      title: "Record books",
      text: "Highest-scoring games, biggest wins and longest streaks across the seasons we store.",
      link: { label: "NFL records", href: "/nfl/records" },
    },
  ];
}

export interface HowStep {
  n: number;
  title: string;
  text: string;
}

/** What the picker really does: blocksForSports puts live scores first, then each sport's blocks, then the desk. */
export const HOW_STEPS: HowStep[] = [
  { n: 1, title: "Pick what you follow", text: "Sports first, then any team or player. Two taps is enough." },
  { n: 2, title: "Your page builds itself", text: "Live scores first, then the tables and next fixtures for what you picked, then the newest from the desk. It opens like this every time on this device." },
  { n: 3, title: "Take it with you", text: "Send your page to another device with one link. Add your team's fixtures to your calendar; the feed updates itself as games finish." },
];

export const HOW_NOTE = "No account, no email. Your picks are saved in this browser; a link moves them to another device.";

/**
 * The cricket archive sentence for the trust module, read from the same years the cricket pages use, so it cannot fall
 * behind a backfill. A format with nothing left out (the T20I archive starts at the first one ever) is not listed.
 */
export function cricketArchiveLine(): string {
  const parts: string[] = [];
  const test = archiveStartYear("test");
  if (test !== null) parts.push(`men's Tests ${testsSince(test)}`);
  const odi = archiveStartYear("odi");
  if (odi !== null) parts.push(`men's ODIs since ${odi}`);
  const t20i = archiveStartYear("t20i");
  if (t20i !== null) parts.push(`men's T20Is since ${t20i}`);
  const wodi = archiveStartYear("wodi");
  const wt20i = archiveStartYear("wt20i");
  if (wodi !== null && wodi === wt20i) parts.push(`women's ODIs and T20Is since ${wodi}`);
  else {
    if (wodi !== null) parts.push(`women's ODIs since ${wodi}`);
    if (wt20i !== null) parts.push(`women's T20Is since ${wt20i}`);
  }
  if (parts.length === 0) return "";
  return `Cricket history is partial: ${parts.join(", ")}. Career totals count the matches held on this site, not an all-time record.`;
}

export interface TrustItem {
  id: "computed" | "fresh" | "signup" | "sources";
  title: string;
  text: string;
  link: { label: string; href: string };
}

export function trustItems(): TrustItem[] {
  return [
    {
      id: "computed",
      title: "Computed from stored results",
      text: "Season totals are summed from the box scores we store, and projections are statistical estimates, not forecasts. None of it is an official record.",
      link: { label: "Methodology", href: "/methodology" },
    },
    {
      id: "fresh",
      title: "Fresh, and it says so",
      text: `Stored results are refreshed every ${RESULTS_REFRESH_MINUTES} minutes. The status page shows the age of the newest result in every league.`,
      link: { label: "Data status", href: "/status" },
    },
    {
      id: "signup",
      title: "Nothing to sign up for",
      text: "There are no accounts. No name, email or password is asked for, and your page is saved in this browser on this device.",
      link: { label: "Privacy", href: "/privacy" },
    },
    {
      id: "sources",
      title: "Sources named",
      text: "Public ESPN feeds for scores and stats, Cricsheet data for ODI and T20 international cricket, and Wikimedia Commons for player photographs.",
      link: { label: "Where it comes from", href: "/methodology" },
    },
  ];
}
