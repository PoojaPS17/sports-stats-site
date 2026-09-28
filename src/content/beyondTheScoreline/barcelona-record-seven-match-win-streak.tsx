import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { BarcelonaOpeningStreakChart } from "@/components/BarcelonaOpeningStreakChart";
import { LaLigaTopPointsGapChart } from "@/components/LaLigaTopPointsGapChart";

export const article: BeyondTheScorelineArticle = {
  slug: "barcelona-record-seven-match-win-streak",
  title: "Barcelona's Record Run to Open the Season",
  dek: "Barcelona have won seven from seven in La Liga and eight straight in all competitions, the best start in the club's history, with Real Madrid already two defeats behind them.",
  publishedAt: "2026-09-28",
  readingMinutes: 5,
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
    {
      label: "La Liga top scorers",
      href: "/laliga/leaders",
      description: "Goals and assists leaders this season",
    },
  ],
  body: () => (
    <>
      <p>
        Barcelona had never won more than six matches in a row to open a season. Under Hansi Flick, they have now won
        eight in a row across all competitions, seven of them in La Liga, and have not even needed to come from behind
        more than once to do it.
      </p>
      <p>
        The run started with a 5-0 win at Elche and kept going through Athletic Club, Rayo Vallecano and Valencia, all
        in La Liga. Barcelona then opened their Champions League campaign with a 5-1 win over Feyenoord, beat Levante,
        put seven past Racing Santander, and then had to work for the eighth: away at Sevilla, Youssouf Fofana headed
        the hosts in front after 19 minutes before Raphinha scored a hat-trick to turn it around, 3-1. Barcelona have
        now scored 36 goals and conceded eight across the run.
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
          { opponent: "Sevilla", competition: "La Liga", goalsFor: 3, goalsAgainst: 1 },
        ]}
      />
      <p>
        Barcelona had won their first six competitive matches of a season three times before this one, in 1929-30,
        1960-61 and 2018-19. None of those teams made it to a seventh match still unbeaten. This one made it to eight,
        and pundits have called the seven-from-seven La Liga start one of the best in any of Europe&rsquo;s top five
        leagues in nearly a century.
      </p>
      <p>
        It shows in the league table on its own too. Through the La Liga rounds alone, Barcelona are top with 21
        points from seven matches, seven wins from seven, 31 goals scored and seven conceded. Atlético Madrid and Real
        Betis follow on 16, with Real Madrid fourth on 15 after five wins and two defeats in their first seven games.
      </p>
      <LaLigaTopPointsGapChart
        asOf="September 23"
        data={[
          { team: "Barcelona", points: 21, played: 7, highlight: true },
          { team: "Atlético Madrid", points: 16, played: 7 },
          { team: "Real Betis", points: 16, played: 7 },
          { team: "Real Madrid", points: 15, played: 7 },
        ]}
      />
      <p>
        The Sevilla result is the one that best sums up the difference between the two Spanish giants&rsquo; starts.
        Real Madrid have already lost twice, while Barcelona have twice trailed in a match, at Rayo Vallecano and now
        at Sevilla, and come away with a win both times. Raphinha has scored two hat-tricks in the run, the closest
        Barcelona have come to needing a rescue act.
      </p>
      <p>
        The fixtures get harder from here. Barcelona return after the international break to face Getafe on October
        10, then travel to Galatasaray and Real Betis before hosting PSG in the Champions League on October 20. Five
        days later comes the first Clásico of the season, at home to Real Madrid on October 25, the match that will
        say more about this start than any of the eight that came before it.
      </p>
    </>
  ),
};
