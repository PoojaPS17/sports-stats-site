import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { GuardiansAldsByTheNumbersChart } from "@/components/GuardiansAldsByTheNumbersChart";
import { GuardiansStrikeoutRecordsChart } from "@/components/GuardiansStrikeoutRecordsChart";

export const article: BeyondTheScorelineArticle = {
  slug: "guardians-21-strikeouts-alds-comeback",
  title: "21 Strikeouts: The Guardians' ALDS Comeback by the Numbers",
  dek: "Cleveland's pitching staff struck out 21 White Sox batters in Game 5, the most in any nine-inning game in MLB history, to complete a comeback from 0-2 down and reach the ALCS.",
  publishedAt: "2026-10-12",
  readingMinutes: 5,
  tags: ["mlb", "guardians", "white-sox"],
  art: { number: "21", caption: "strikeouts by Cleveland's staff in Game 5, the most ever in a nine-inning game" },
  relatedLinks: [
    {
      label: "MLB standings",
      href: "/mlb/standings",
      description: "2026 regular season and postseason picture",
    },
    {
      label: "MLB records",
      href: "/mlb/records",
      description: "Season and franchise marks across the league",
    },
    {
      label: "MLB scores, October 10",
      href: "/mlb/scores/2026-10-10",
      description: "Every game from ALDS Game 5 day",
    },
    {
      label: "The Rays' first-ever ALDS sweep",
      href: "/beyond-the-scoreline/rays-sweep-yankees-alds-first-ever",
      description: "Cleveland's opponent in the ALCS, by the numbers",
    },
  ],
  body: () => (
    <>
      <p>
        Jose Ramirez hit a two-run homer off Sean Burke in the fourth inning on Saturday, and it held up as the only
        scoring of the night. Cleveland&rsquo;s pitching staff made sure of it, striking out 21 Chicago White Sox
        batters in a 2-0 win that closed out a winner-take-all Game 5 and sent the Guardians to the ALCS. No team had
        ever struck out that many in a nine-inning game, regular season or postseason, in the century-plus that
        strikeouts have been tracked.
      </p>
      <GuardiansAldsByTheNumbersChart
        data={[
          { value: "21", label: "Strikeouts by Guardians pitchers in Game 5", note: "The most in any nine-inning game, regular season or postseason, on record" },
          { value: "12", label: "Gavin Williams' own strikeouts", note: "5.2 innings, 1 hit, 1 walk, 94 pitches, ties the franchise's postseason single-game record" },
          { value: "2-0", label: "Final score", note: "Ramirez's fourth-inning homer off Sean Burke was the only run either team scored" },
          { value: "0-2", label: "Series deficit erased", note: "Chicago won both games at Progressive Field before Cleveland swept the next three" },
        ]}
      />
      <p>
        The deficit made the record stranger still. The White Sox won Game 1 3-0 and Game 2 4-3, both in Cleveland,
        and looked set to end the Guardians&rsquo; season on their own field. Cleveland answered by winning three
        straight: 9-3 and 9-5 at Guaranteed Rate Field to force a fifth game, then 2-0 back home to finish it.
        Chicago, the AL&rsquo;s Wild Card entrant that had swept Houston to even reach this series, had taken two
        games on the road against a team that had just won a third straight AL Central title. It was not enough.
      </p>
      <p>
        Williams set the tone from the first inning, striking out five batters in a row at one point and finishing
        with 12 in 5.2 innings on 94 pitches, walking one and allowing a single hit. That ties Charles Nagy&rsquo;s
        Cleveland postseason record, also 12, set in Game 4 of the 1996 ALDS against Baltimore. The connection runs
        deeper than the number. That same 1996 series is the one in which Baltimore&rsquo;s pitching staff struck out
        23 Cleveland batters in a 12-inning win, still the most in any postseason game of any length, thirty years
        on. Hunter Gaddis and closer Cade Smith finished Saturday&rsquo;s game, each adding four more strikeouts of
        their own to push the team total past a mark Cleveland itself had set just three days earlier.
      </p>
      <GuardiansStrikeoutRecordsChart
        data={[
          { game: "Guardians, Game 5 (2026)", strikeouts: 21, note: "ALDS Game 5 vs White Sox, the new nine-inning record, Oct 10 2026", highlight: true },
          { game: "Nationals (2016)", strikeouts: 20, note: "Max Scherzer struck out 20 Tigers himself in a 3-2 win, one of six team totals of 20 reached before this game" },
          { game: "Guardians, Game 3 (2026)", strikeouts: 19, note: "ALDS Game 3 vs White Sox, the previous postseason nine-inning record, set three days earlier in the same series" },
        ]}
      />
      <p>
        That chart is the shape of how rare Saturday was. Twenty strikeouts in nine innings had happened only a
        handful of times across more than a century of box scores, most memorably when Max Scherzer struck out 20
        Detroit Tigers by himself in 2016. Cleveland&rsquo;s own staff had already topped that list once this
        October, in Game 3, before beating its own three-day-old record by two more strikeouts in the game that
        actually ended the series.
      </p>
      <p>
        Ramirez&rsquo;s swing supplied the only offense either side needed. Steven Kwan opened the fourth with a
        leadoff single off Burke, and five pitches later Ramirez drove one out to right field, plating Kwan ahead of
        him. Burke took the loss despite allowing only four hits across five innings; with Chicago&rsquo;s lineup
        swinging through 21 strikeouts, two runs were all the Guardians needed.
      </p>
      <p>
        For Cleveland, the record-setting strikeout night is also the kind of pitching depth a team needs deep into
        October. The Guardians now face the Tampa Bay Rays in the ALCS, with Game 1 at Tropicana Field today. Tampa
        Bay enters having swept the Yankees in the first sweep of an ALDS in franchise history, which means both
        teams arrive on the back of a series that ended faster than expected, for very different reasons. For the
        White Sox, a season that returned them to the playoffs for the first time since 2021 ends instead with the
        odd distinction of being outlasted by a record nobody saw coming, set by the team that beat them.
      </p>
    </>
  ),
};
