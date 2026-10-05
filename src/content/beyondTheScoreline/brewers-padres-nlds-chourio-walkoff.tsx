import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { BrewersPadresNldsChart } from "@/components/BrewersPadresNldsChart";
import { BrewersByTheNumbersChart } from "@/components/BrewersByTheNumbersChart";

export const article: BeyondTheScorelineArticle = {
  slug: "brewers-padres-nlds-chourio-walkoff",
  title: "Chourio Beats Padres Twice as Brewers Take 2-0 NLDS Lead",
  dek: "Jackson Chourio delivered the decisive moment in both of Milwaukee's first two NLDS wins over San Diego, as the 103-win Brewers chase their first pennant since 1982.",
  publishedAt: "2026-10-05",
  readingMinutes: 5,
  tags: ["mlb", "brewers", "padres"],
  art: { number: "2-0", caption: "NLDS lead over the Padres after two dramatic ninth innings in 20 hours" },
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
      label: "MLB scores, October 4",
      href: "/mlb/scores/2026-10-04",
      description: "Every game from NLDS Game 2 day",
    },
  ],
  body: () => (
    <>
      <p>
        Mason Miller walked the bases loaded, and Jackson Chourio made him pay for it. With two outs in the ninth
        inning on Sunday, Chourio lined a two-run single past a drawn-in infield to beat the Padres&rsquo; closer and
        give the Brewers a 4-3 win in NLDS Game 2. Milwaukee has not trailed in the series, and it has not needed
        to: both wins have come from behind in the late innings, and Chourio has been at the center of both.
      </p>
      <p>
        San Diego had every reason to feel good about the ninth. Miller, who entered October as one of the most
        dominant closers in the league, got the call for a two-inning save and needed every bit of it, striking out
        the first two batters of the inning before his control deserted him. Three straight walks loaded the bases,
        and Chourio, batting with two strikes, found a two-out single that scored two of the three and sent American
        Family Field into a frenzy that had barely died down from the night before.
      </p>
      <BrewersPadresNldsChart data={[{ game: "Game 1", brewersRuns: 3, padresRuns: 2 }, { game: "Game 2", brewersRuns: 4, padresRuns: 3 }]} />
      <p>
        Game 1 had its own late twist. The Padres chased Brewers ace Jacob Misiorowski after four innings and led
        2-0, but Chourio answered with a two-run homer in the third to tie it, and catcher William Contreras put
        Milwaukee ahead with a solo shot in the seventh. San Diego nearly tied it right back in the ninth when Ty
        France drove a ball toward the outfield wall, only for it to clip a roof support cable at American Family
        Field and fall for an out, caught by Chourio, who was in the right place twice in two nights without ever
        touching a bat on the second occasion. The Brewers held on, 3-2.
      </p>
      <p>
        Those two nights are the latest chapter in a season Milwaukee has not had before. The Brewers finished
        103-59, a franchise record and the best mark in the majors, clinching home-field advantage through the
        entire postseason. It is their eighth trip to the playoffs in nine years, and it follows a run to the NLCS
        last October that ended short of the World Series. A 103-win season is no guarantee of anything deeper into
        October, but it has bought the Brewers the right to host every game of this series that matters, including
        a possible decisive Game 5.
      </p>
      <BrewersByTheNumbersChart
        data={[
          { value: "103-59", label: "Brewers' 2026 record", note: "a franchise record and the best mark in MLB" },
          { value: "8th", label: "Playoff trip in 9 years", note: "with home-field advantage all October" },
          { value: "1982", label: "The Brewers' only pennant", note: "lost that World Series in 7 games to the Cardinals" },
        ]}
      />
      <p>
        That 1982 team, nicknamed Harvey&rsquo;s Wallbangers after manager Harvey Kuenn, remains the only Milwaukee
        club to reach the World Series. Robin Yount and Paul Molitor led the Brewers to a 3-2 series lead over St.
        Louis before the Cardinals won the last two games, including Game 7 at home. Forty-four years later, Milwaukee
        is one of only five current franchises never to have won it all, and a win over San Diego would put the
        Brewers back in the NLCS with a real shot at finally changing that.
      </p>
      <p>
        Chourio, who turned 22 in March, is doing more than hitting in the clutch. In 2024 and 2025 he became the
        youngest player in major league history to post back-to-back 20-homer, 20-steal seasons, and he has carried
        that same knack for the big moment straight into October: a tying homer and a series-saving catch in Game
        1, a two-run, two-out single off an All-Star closer in Game 2. The series shifts to San Diego for Game 3 on
        Tuesday, where the Padres have to win three straight just to force a return trip to Milwaukee.
      </p>
    </>
  ),
};
