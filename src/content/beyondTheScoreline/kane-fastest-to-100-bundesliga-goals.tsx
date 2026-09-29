import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { BundesligaFastestTo100Chart } from "@/components/BundesligaFastestTo100Chart";
import { BundesligaMinutesPerGoalTable } from "@/components/BundesligaMinutesPerGoalTable";

export const article: BeyondTheScorelineArticle = {
  slug: "kane-fastest-to-100-bundesliga-goals",
  title: "Kane's Record Run to 100 Bundesliga Goals",
  dek: "Harry Kane needed just 98 games to reach 100 Bundesliga goals, the fastest anyone has ever done it, in Bayern Munich's 7-0 rout of Union Berlin.",
  publishedAt: "2026-09-29",
  readingMinutes: 5,
  tags: ["bundesliga", "bayern-munich", "harry-kane"],
  art: { number: "100", caption: "Bundesliga goals for Harry Kane, in fewer games than anyone before him" },
  relatedLinks: [
    {
      label: "Bundesliga standings",
      href: "/bundesliga/standings",
      description: "Full 2026-27 table, updated after every round",
    },
    {
      label: "Bundesliga top scorers",
      href: "/bundesliga/leaders",
      description: "Goals and assists leaders this season",
    },
    {
      label: "Bundesliga teams",
      href: "/bundesliga/teams",
      description: "Every club in Germany's top flight",
    },
  ],
  body: () => (
    <>
      <p>
        Harry Kane stepped up to take a penalty in the 39th minute against Union Berlin and did what he does most
        weeks now. He scored, and it was his 100th Bundesliga goal, reached in just 98 appearances, the fastest
        century of goals anyone has ever managed in the competition.
      </p>
      <p>
        The goal made it 2-0 in what finished a 7-0 rout at the Allianz Arena. Jamal Musiala had opened the scoring
        in the 18th minute, and Michael Olise made it 3-0 in the 43rd, on his way to the first Bayern Munich
        hat-trick of his career. Kane was not finished either: nine minutes into the second half, he headed in his
        101st Bundesliga goal to put the game away.
      </p>
      <p>
        No one has reached a Bundesliga century faster. The previous record belonged to Dieter M&uuml;ller, who
        needed 129 appearances for Cologne in the 1970s, 31 more than Kane. Gerd M&uuml;ller took 136 games, Lothar
        Emmerich 140, and Uwe Seeler, one of the league&rsquo;s founding stars, 157.
      </p>
      <BundesligaFastestTo100Chart
        data={[
          { player: "Harry Kane", team: "Bayern Munich", games: 98, highlight: true },
          { player: "Dieter Müller", team: "1. FC Köln", games: 129 },
          { player: "Gerd Müller", team: "Bayern Munich", games: 136 },
          { player: "Lothar Emmerich", team: "Dortmund", games: 140 },
          { player: "Uwe Seeler", team: "Hamburg", games: 157 },
        ]}
      />
      <p>
        The speed owes as much to consistency as to bursts of scoring. Since joining Bayern in 2023, Kane has scored
        a Bundesliga goal every 78.3 minutes on average, a better rate than Erling Haaland (87 minutes), Robert
        Lewandowski (100) or even Gerd M&uuml;ller (105) ever managed in the league.
      </p>
      <BundesligaMinutesPerGoalTable
        asOf="September 18, 2026"
        data={[
          { player: "Harry Kane", team: "Bayern Munich", minutesPerGoal: 78.3, highlight: true },
          { player: "Erling Haaland", team: "Dortmund", minutesPerGoal: 87 },
          { player: "Robert Lewandowski", team: "Bayern Munich", minutesPerGoal: 100 },
          { player: "Gerd Müller", team: "Bayern Munich", minutesPerGoal: 105 },
        ]}
      />
      <p>
        Kane arrived at Bayern in August 2023 for a club-record fee, ending 19 years at Tottenham without a major
        trophy. The goals came immediately: 36 of them in his first Bundesliga season, enough to win the
        Torj&auml;gerkanone as the league&rsquo;s top scorer. The title did not follow. Bayer Leverkusen went
        unbeaten that season and ended Bayern&rsquo;s 11-year run of Bundesliga titles, leaving Kane&rsquo;s debut
        year medal-less despite the individual record.
      </p>
      <p>
        The trophy arrived the following year. Kane scored 26 times in 2024-25 to retain his scoring title, becoming
        the first player in Bundesliga history to win it in each of his first two seasons, and Bayern reclaimed the
        championship. They won it again in 2025-26, Kane&rsquo;s second straight title alongside his second straight
        Torj&auml;gerkanone.
      </p>
      <p>
        Bayern head into the international break unbeaten through four matchdays of 2026-27, second on 10 points
        behind Borussia Dortmund&rsquo;s 12 but with the division&rsquo;s best goal difference at plus 12, most of it
        built in one afternoon against Union Berlin. Their next Bundesliga game is away at Augsburg on October 10,
        the first test of whether Kane&rsquo;s hot start survives the trip out of Munich.
      </p>
    </>
  ),
};
