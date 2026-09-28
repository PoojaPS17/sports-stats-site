import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";

export const article: BeyondTheScorelineArticle = {
  slug: "man-city-guilty-verdict-115-charges",
  title: "Man City Found Guilty on Nearly All 115 Charges",
  dek: "An independent panel found Manchester City guilty on 114 of the 115 Premier League charges against it, with sanctions and an expected appeal still to come.",
  publishedAt: "2026-09-27",
  readingMinutes: 3,
  tags: ["epl", "manchester-city", "premier-league"],
  art: { number: "114/115", caption: "charges proven against Manchester City", palette: "football" },
  relatedLinks: [
    {
      label: "Manchester City",
      href: "/epl/teams/manchester-city",
      description: "Squad, results and every season back to 2015",
    },
    {
      label: "Premier League standings",
      href: "/epl/standings",
      description: "2026-27 table, once the season is underway",
    },
  ],
  body: () => (
    <>
      <p>
        An independent panel has found Manchester City guilty of breaking the majority of the Premier League
        financial rules it was charged with, according to reports from multiple outlets on Friday. Sources told the
        BBC the panel ruled against City on 114 of the 115 counts.
      </p>
      <p>
        The charges came out of a Premier League investigation into City&rsquo;s financial records, sponsorship
        arrangements and cooperation with the league. Hearings before the independent panel ran through late 2024.
        The verdict was delayed for nearly two years before Friday&rsquo;s reports.
      </p>
      <p>
        This isn&rsquo;t the final word. City is expected to appeal, and Premier League rules give a club 14 days to
        do so once a written decision arrives. An appeal goes to a separate three-person panel and delays any
        punishment. A ruling on guilt and a decision on sanctions are two different hearings. The panel has
        reportedly settled only the first.
      </p>
      <p>
        Premier League rules allow for a fine, a points deduction, or, in the most severe case, expulsion. Which of
        those follows, if any survives an appeal, isn&rsquo;t decided yet. The Premier League has not commented
        publicly on the reports.
      </p>
      <p>
        The financial rules case has now run longer than some of the punishments it could produce. The next
        milestone is City&rsquo;s appeal, due within 14 days of the panel&rsquo;s written decision.
      </p>
    </>
  ),
};
