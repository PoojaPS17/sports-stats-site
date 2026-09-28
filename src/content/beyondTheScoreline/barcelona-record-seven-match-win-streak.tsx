import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { BarcelonaOpeningStreakChart } from "@/components/BarcelonaOpeningStreakChart";

export const article: BeyondTheScorelineArticle = {
  slug: "barcelona-record-seven-match-win-streak",
  title: "Barcelona's Record Run to Open the Season",
  dek: "Barcelona have won each of their first seven competitive matches this season, the best start in the club's history and, by several counts, the best in Europe's top five leagues in nearly a century.",
  publishedAt: "2026-09-28",
  readingMinutes: 3,
  tags: ["laliga", "barcelona", "hansi-flick"],
  relatedLinks: [
    {
      label: "La Liga standings",
      href: "/laliga/standings",
      description: "Full 2026-27 table, updated after every round",
    },
    {
      label: "La Liga teams",
      href: "/laliga/teams",
      description: "Every club in Spain's top flight",
    },
  ],
  body: () => (
    <>
      <p>
        Barcelona had never won more than six matches in a row to open a season. Under Hansi Flick, they have now won
        seven, five of them by two goals or more.
      </p>
      <p>
        The run started with a 5-0 win at Elche and kept going through Athletic Club, Rayo Vallecano and Valencia,
        all in La Liga. Barcelona then opened their Champions League campaign with a 5-1 win over Feyenoord before
        beating Levante and, finally, Racing Santander 7-2 to make it seven from seven. Along the way they scored 33
        goals and conceded seven.
      </p>
      <BarcelonaOpeningStreakChart
        data={[
          { opponent: "Elche", competition: "La Liga", goalsFor: 5, goalsAgainst: 0 },
          { opponent: "Athletic Club", competition: "La Liga", goalsFor: 2, goalsAgainst: 0 },
          { opponent: "Rayo Vallecano", competition: "La Liga", goalsFor: 5, goalsAgainst: 2 },
          { opponent: "Valencia", competition: "La Liga", goalsFor: 5, goalsAgainst: 0 },
          { opponent: "Feyenoord", competition: "Champions League", goalsFor: 5, goalsAgainst: 1 },
          { opponent: "Levante", competition: "La Liga", goalsFor: 4, goalsAgainst: 2 },
          { opponent: "Racing Santander", competition: "La Liga", goalsFor: 7, goalsAgainst: 2 },
        ]}
      />
      <p>
        Barcelona had won their first six competitive matches of a season three times before this one, in 1929-30,
        1960-61 and 2018-19. None of those teams made it to a seventh match still unbeaten. This one did, and pundits
        have called it the best start by a club in any of Europe&rsquo;s top five leagues in almost a hundred years.
      </p>
      <p>
        It shows in the league table on its own too. Through the La Liga rounds alone, Barcelona are top with 21
        points from seven matches, seven wins from seven, 31 goals scored and seven conceded. Atlético Madrid and Real
        Betis follow on 16, with Real Madrid fourth on 15, as of September 23.
      </p>
      <p>
        Flick&rsquo;s side have not had to grind any of this out. Five of the seven wins came by two goals or more, and the
        closest match, 2-0 over Athletic Club, was still a clean sheet. The next test of the run is whatever comes
        after it: no Barcelona team has had to defend a streak this long before.
      </p>
    </>
  ),
};
