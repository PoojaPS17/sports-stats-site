import Link from "next/link";
import { pageMeta } from "@/lib/metadata";
import { SITE_NAME } from "@/lib/site";
import { LegalPage } from "@/components/LegalPage";

// Static copy, but a page without `revalidate` freezes at the edge for a year (see privacy/page.tsx).
export const revalidate = 300;

export const metadata = pageMeta(
  "Methodology: where the stats come from",
  `Where ${SITE_NAME} gets its scores and stats, how often they refresh, how seasons, totals and ratings are counted, and the known gaps.`,
  "/methodology"
);

const UPDATED = "October 7, 2026";

export default function MethodologyPage() {
  return (
    <LegalPage title="Methodology" updated={UPDATED} subtitle={`How ${SITE_NAME} counts, and where it can differ from other sites. Last updated ${UPDATED}.`}>
      <h2>Where the data comes from</h2>
      <p>
        Scores, box scores, schedules, standings and rosters for football, the NFL, NBA, MLB, tennis, F1 and most cricket come from the public
        feeds behind ESPN&apos;s own sites. ODI and T20 international cricket scorecards and ball-by-ball results are derived from data published
        by <a href="https://cricsheet.org" rel="noopener">Cricsheet</a>. Player photographs and some biographical details come from Wikimedia
        Commons and Wikidata, credited on the page where they appear. Everything on this site is computed from those sources by us; none of it is
        an official record.
      </p>

      <h2>How often it refreshes</h2>
      <ul>
        <li>Live scores and finished results are fetched every few minutes while games are on.</li>
        <li>A full pass (standings, rosters, season totals, rankings, player pages) runs once a day, early morning UTC.</li>
        <li>Finished game and match pages are cached for up to a day, so a late correction can take that long to show.</li>
      </ul>
      <p>
        The <Link href="/status">status page</Link> shows the age of the newest result per league, so you can tell whether a quiet page is a quiet
        league or a late feed.
      </p>

      <h2>How stats are counted</h2>
      <ul>
        <li>
          <strong>Season totals and averages</strong> are the sum of the box scores we hold for regular-season games. Preseason, play-in, All-Star
          and cup-final games are listed separately, not folded into the regular-season line.
        </li>
        <li>
          <strong>Games played</strong> counts games where the player has a stat line. For NFL players with no stat line in a game (many linemen
          and special-teams players), the headline games-played figure comes from ESPN&apos;s own season record, and the season table shows dashes
          where we hold no box score.
        </li>
        <li>
          <strong>Traded players</strong> show one row per team plus a season total.
        </li>
        <li>
          <strong>Dates and times</strong> follow the league&apos;s own day for kickoff times, so a late US evening game stays on its league day
          rather than the next UTC day. Your own clock is shown where it differs.
        </li>
        <li>
          <strong>Cricket</strong> results use the standard written form (&ldquo;won by 5 wickets&rdquo;). &ldquo;All out&rdquo; is shown
          instead of a ten-wicket score, and a match with no result is shown as no result, not as a draw.
        </li>
        <li>
          <strong>Projections, power rankings and win probabilities</strong> are statistical estimates built from results and ratings on this
          site. They are not forecasts, betting tips or advice.
        </li>
      </ul>

      <h2 id="gaps">Known gaps</h2>
      <ul>
        <li>Some older NBA games (Bulls and Pelicans, seasons ending 2015 to 2018) have no box score at the source. Player games-played for those seasons follows ESPN&apos;s season record, and averages cover the games we have box scores for.</li>
        <li>A handful of games list a player who played but carry no player id at the source, so the line cannot be stored.</li>
        <li>In-season totals at the source sometimes lag the box scores by a day. We follow the box scores.</li>
        <li>Postponed and cancelled games are kept with their original date and a note, and the replayed game appears separately.</li>
        <li>History depth differs by league and competition. Smaller cricket competitions have fewer seasons than the major leagues.</li>
      </ul>

      <h2>Corrections</h2>
      <p>
        If a number looks wrong, please <Link href="/contact">tell us</Link> with the page address. A fix to our own counting is made everywhere
        at once; a fault at the source is passed on to it.
      </p>
    </LegalPage>
  );
}
