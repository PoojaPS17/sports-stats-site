import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { WhiteSoxTurnaroundChart } from "@/components/WhiteSoxTurnaroundChart";
import { WhiteSoxAstrosWildCardChart } from "@/components/WhiteSoxAstrosWildCardChart";

export const article: BeyondTheScorelineArticle = {
  slug: "white-sox-121-losses-to-wild-card-sweep",
  title: "From 121 Losses to the ALDS: White Sox Stun Astros",
  dek: "The Chicago White Sox lost a modern-record 121 games in 2024, then swept the Houston Astros out of the 2026 playoffs two years later.",
  publishedAt: "2026-10-03",
  readingMinutes: 5,
  tags: ["mlb", "white-sox", "astros"],
  art: { number: "121", caption: "losses in 2024, a modern MLB record, two years before sweeping the Astros" },
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
      label: "MLB teams",
      href: "/mlb/teams",
      description: "Every club in Major League Baseball",
    },
  ],
  body: () => (
    <>
      <p>
        Two years ago, the Chicago White Sox lost 121 games, more than any team in the modern history of baseball.
        On Wednesday night at Daikin Park in Houston, they finished off a sweep of the Astros in the American League
        Wild Card Series. The White Sox open the AL Division Series on the road against the Cleveland Guardians
        today, four wins from a pennant that would have sounded absurd at any point in the last three seasons.
      </p>
      <p>
        The 2024 season is the one the record books remember. Chicago finished 41-121, surpassing the 1962 New York
        Mets&rsquo; mark of 120 losses, a number that had stood for 62 years before the White Sox beat it by a
        single game. It was the worst season by any team since baseball&rsquo;s modern era began in 1901, a floor so
        low that even small improvement the following year would have looked like progress.
      </p>
      <WhiteSoxTurnaroundChart
        data={[
          { season: "2024", wins: 41, losses: 121 },
          { season: "2025", wins: 60, losses: 102 },
          { season: "2026", wins: 84, losses: 78, highlight: true },
        ]}
      />
      <p>
        Progress came slowly at first. The White Sox lost 102 games in 2025, their third straight season with 100
        or more losses after 101 in 2023 and the record-setting 121 in 2024. No team in major league history had
        ever gone on to make the playoffs the year after a run like that. Then Chicago did exactly that, finishing
        2026 at 84-78, a 24-win jump from the previous season, and clinching a long-awaited return to the postseason
        in the season&rsquo;s final week.
      </p>
      <p>
        Manager Will Venable&rsquo;s roster had new faces doing the heaviest lifting. Japanese slugger Munetaka
        Murakami, signed over the winter after eight seasons with the Yakult Swallows, tied a major league rookie
        record by homering in five straight games during his first season in Chicago. The White Sox led the AL
        Central for long stretches of the summer before Cleveland caught them in September, leaving Chicago to
        settle for the final American League Wild Card spot instead of a division title.
      </p>
      <p>
        That seeding sent them to Houston, the AL West champion, for a best-of-three series that most bettors
        expected the Astros to win at home. Instead the White Sox took Game 1 6-3 on September 29 and closed it out
        7-3 the following night, never trailing in either game&rsquo;s final innings. It was just the third
        postseason meeting between the two clubs. The White Sox swept Houston in the 2005 World Series, back when
        the Astros still played in the National League, and the Astros won the 2021 AL Division Series between
        them. This sweep moves the rivalry&rsquo;s postseason record to 2-1 in Chicago&rsquo;s favor.
      </p>
      <WhiteSoxAstrosWildCardChart
        data={[
          { game: "Game 1", whiteSoxRuns: 6, astrosRuns: 3 },
          { game: "Game 2", whiteSoxRuns: 7, astrosRuns: 3 },
        ]}
      />
      <p>
        There is no time to savor it. The Division Series against Cleveland, the division rival that denied Chicago
        the AL Central crown three weeks ago, opens today on the road. Beating the Guardians would put the White
        Sox in the AL Championship Series for the first time since 2005, the year they last won it all. Whatever
        happens from here, a franchise that lost 121 games in a single season has already played its way back into
        October baseball, and that alone was not supposed to happen this soon.
      </p>
    </>
  ),
};
