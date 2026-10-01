import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { BayernStreaksEndedChart } from "@/components/BayernStreaksEndedChart";
import { BundesligaTopPointsChart } from "@/components/BundesligaTopPointsChart";

export const article: BeyondTheScorelineArticle = {
  slug: "bayern-67-matchday-reign-ends",
  title: "Bayern's 67-Matchday Reign Atop the Bundesliga Ends",
  dek: "Newly promoted Schalke held Bayern Munich scoreless to end a run of 67 straight matchdays at the top of the Bundesliga, and Borussia Dortmund have taken over first place instead.",
  publishedAt: "2026-09-30",
  readingMinutes: 5,
  tags: ["bundesliga", "bayern-munich", "borussia-dortmund"],
  art: { number: "67", caption: "matchdays Bayern Munich led the Bundesliga, before Schalke ended the run" },
  relatedLinks: [
    {
      label: "Bundesliga standings",
      href: "/bundesliga/standings",
      description: "2026-27 table, updated after every round",
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
        Schalke 04 had not beaten Bayern Munich since 2011. On September 5, freshly promoted and playing at home, they
        did not need to win to make history. A goalless draw was enough to end two of the longest streaks in Bayern&rsquo;s
        recent history in the same afternoon.
      </p>
      <p>
        The 0-0 result stopped Bayern&rsquo;s run of 67 consecutive matchdays at the top of the Bundesliga table, a reign
        stretching back nearly two years. It was also Bayern&rsquo;s first blank in a Bundesliga match in more than a year
        and a half, and their run without going scoreless in any competitive fixture reached 59 matches before Schalke
        stopped it. Goalkeeper Loris Karius made the saves that mattered, denying a fierce Harry Kane effort from distance
        among them. Bayern manager Vincent Kompany credited Schalke&rsquo;s defensive display afterward.
      </p>
      <BayernStreaksEndedChart
        data={[
          {
            value: "67",
            label: "matchdays atop the table",
            note: "a run stretching back nearly two years, now over",
          },
          {
            value: "59",
            label: "matches without going scoreless",
            note: "Bayern's longest active run in any competition, stopped by Schalke's defense",
          },
        ]}
      />
      <p>
        For Schalke, the result matters almost as much as a win would have. Relegated for years, they came back up to
        the Bundesliga this season and had lost twelve straight meetings with Bayern before that Friday, without so
        much as a draw since 2011. Taking a point at home, off the champions, with a goalkeeper making the difference,
        is the kind of result a promoted club can build a season&rsquo;s confidence on.
      </p>
      <p>
        The draw dropped Bayern to fourth in the table after two matchdays. It did not last. Bayern have not lost
        since, winning both of their next two matches to move back to second, level on points with Freiburg and two
        behind Borussia Dortmund, who have won all four of their matches so far, scoring nine goals and conceding just
        two.
      </p>
      <BundesligaTopPointsChart
        asOf="September 30"
        data={[
          { team: "Borussia Dortmund", points: 12, played: 4, highlight: true },
          { team: "Bayern Munich", points: 10, played: 4 },
          { team: "Freiburg", points: 10, played: 4 },
        ]}
      />
      <p>
        Bayern&rsquo;s goal difference, plus 12 through four matches, is the best of any Bundesliga side and currently the
        only thing separating them from a Freiburg team that also has not lost this season, sitting third with a goal
        difference of plus nine. Three unbeaten teams inside the top three, one of them the newly-crowned league leader
        for the first time in nearly two years, is not the start anyone at Bayern will have wanted after their run atop
        the table came to an end.
      </p>
      <p>
        The Bundesliga returns to action in early October for matchday five, when Dortmund host Werder Bremen looking
        to stay perfect and Bayern try to pull clear of a Freiburg side that has not lost either. Schalke, for their
        part, have already banked the result their promotion season will be remembered for: a single point that ended
        two streaks most of their fans never expected to see broken on the same afternoon.
      </p>
    </>
  ),
};
