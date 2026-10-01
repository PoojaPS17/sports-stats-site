import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { BundesligaGoalsRecordChart } from "@/components/BundesligaGoalsRecordChart";
import { BundesligaTopPointsChart } from "@/components/BundesligaTopPointsChart";

export const article: BeyondTheScorelineArticle = {
  slug: "kane-100-bundesliga-goals-record",
  title: "Kane's 100th Goal Breaks a Record That Stood Since 1977",
  dek: "Harry Kane scored his 100th Bundesliga goal in just 98 games, the fastest ever, as Bayern thrashed Union Berlin 7-0 while Dortmund stayed perfect and top.",
  publishedAt: "2026-10-01",
  readingMinutes: 5,
  tags: ["bundesliga", "bayern-munich", "harry-kane"],
  art: { number: "98", caption: "games it took Harry Kane to reach 100 Bundesliga goals, the fastest ever" },
  relatedLinks: [
    {
      label: "Bundesliga standings",
      href: "/bundesliga/standings",
      description: "Full 2026-27 table, updated after every round",
    },
    {
      label: "Bundesliga teams",
      href: "/bundesliga/teams",
      description: "Every club in Germany's top flight",
    },
    {
      label: "Bundesliga top scorers",
      href: "/bundesliga/leaders",
      description: "Goals and assists leaders this season",
    },
  ],
  body: () => (
    <>
      <p>
        Harry Kane rolled a 39th-minute penalty inside the post at the Allianz Arena on September 18 and became the
        fastest player in Bundesliga history to 100 goals, needing just 98 appearances to get there. He added a
        second in the 54th minute, part of a 7-0 demolition of Union Berlin that opened Bayern Munich&rsquo;s
        Oktoberfest weekend in the best possible way.
      </p>
      <p>
        The record had stood since 1977, when Dieter Müller reached his 100th Bundesliga goal in his 129th
        appearance for Cologne. Kane got there 31 games faster. Bayern&rsquo;s own numbers put his scoring rate at a
        goal every 78.5 minutes in the league, ahead of Erling Haaland, Robert Lewandowski and Bayern great Gerd
        Müller on the same measure.
      </p>
      <BundesligaGoalsRecordChart
        data={[
          { player: "Harry Kane", club: "Bayern Munich", games: 98, season: "2023-26", highlight: true },
          { player: "Dieter Müller", club: "Cologne", games: 129, season: "1976-77" },
        ]}
      />
      <p>
        The Union Berlin scoreline was built on more than one record chase. Jamal Musiala opened the scoring in the
        18th minute, Kane added his penalty and a second goal either side of the hour, Michael Olise scored a
        hat-trick, and Ismael Saibari rounded it off. It was Bayern&rsquo;s biggest win of the season so far and
        stretched their Bundesliga start to three wins and a draw from four games, 14 goals scored and only two
        conceded.
      </p>
      <p>
        That start has not been enough to put Bayern top. Borussia Dortmund have won all four of their league games,
        and their 12 points have them a point and a half clear of Bayern and Freiburg, who are both on 10. Bayer
        Leverkusen sit fifth on seven points after an opening-month wobble, and reigning top scorer Kane&rsquo;s Bayern
        side have the division&rsquo;s best goal difference at plus 12, but on points alone it is Dortmund setting the
        pace four matchdays in.
      </p>
      <BundesligaTopPointsChart
        asOf="September 21"
        data={[
          { team: "Borussia Dortmund", points: 12, played: 4, highlight: true },
          { team: "Bayern Munich", points: 10, played: 4 },
          { team: "SC Freiburg", points: 10, played: 4 },
          { team: "Bayer Leverkusen", points: 7, played: 4 },
        ]}
      />
      <p>
        Kane has not had a quiet season since he arrived from Tottenham in the summer of 2023. He scored 36 league
        goals in his debut Bundesliga campaign, 26 the following season and 35 last season, finishing as the
        division&rsquo;s top scorer in all three and helping Bayern to back-to-back titles in 2024-25 and 2025-26.
        The 100th goal, reached early in his fourth German season, says as much about that consistency as it does
        about any single afternoon against Union Berlin.
      </p>
      <p>
        Bayern&rsquo;s run continues on the road at Augsburg on October 10, before Dortmund&rsquo;s closest pursuers
        at kickoff, RB Leipzig, visit the Allianz Arena on October 17. A Champions League trip to Arsenal follows four
        days after that. None of it changes what already happened at Union Berlin: whatever the table says in May,
        the record books now read Kane, 98 games, 100 goals, and nobody has ever done it faster.
      </p>
    </>
  ),
};
