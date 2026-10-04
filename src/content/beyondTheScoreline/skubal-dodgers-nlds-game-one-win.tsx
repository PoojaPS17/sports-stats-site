import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { SkubalByTheNumbersChart } from "@/components/SkubalByTheNumbersChart";
import { DodgersWorldSeriesStreakChart } from "@/components/DodgersWorldSeriesStreakChart";

export const article: BeyondTheScorelineArticle = {
  slug: "skubal-dodgers-nlds-game-one-win",
  title: "Skubal Shoves as Dodgers Beat Braves in NLDS Game 1",
  dek: "Tarik Skubal, the two-time Cy Young winner the Dodgers traded for in August, struck out seven and allowed one run in his first start for them as Los Angeles beat Atlanta 5-3 to open the NLDS.",
  publishedAt: "2026-10-04",
  readingMinutes: 5,
  tags: ["mlb", "dodgers", "braves"],
  art: { number: "1", caption: "earned run Skubal allowed in his Dodgers postseason debut, a 5-3 NLDS Game 1 win" },
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
        Tarik Skubal threw his first postseason pitch in a Dodgers uniform on Saturday night at Dodger Stadium, and
        six innings later he had a line most pitchers would take in July, let alone a playoff debut: one earned run,
        two hits, seven strikeouts, two walks. Los Angeles beat Atlanta 5-3 to take Game 1 of the National League
        Division Series, and the trade that brought Skubal west looked like exactly what it was sold as.
      </p>
      <p>
        The Dodgers acquired Skubal from the Detroit Tigers on August 2, giving up outfielder Zyhir Hope and
        right-handers River Ryan and Brady Smith for a pitcher who had already won back-to-back American League Cy
        Young awards, in 2024 and 2025. He was 7-5 with a 2.79 ERA in 16 starts for a Tigers team out of postseason
        contention at the time of the deal. In Dodger blue, the numbers barely moved: 4-3, a 2.87 ERA and 71
        strikeouts in 53.1 innings across the rest of the regular season, before Saturday&rsquo;s start dropped his
        ERA in a Dodgers uniform further still.
      </p>
      <SkubalByTheNumbersChart
        data={[
          { value: "2.79", label: "ERA with the Tigers", note: "16 starts before the August 2 trade" },
          { value: "2.87", label: "ERA with the Dodgers", note: "11 regular-season starts after the trade" },
          { value: "7", label: "Strikeouts in his playoff debut", note: "6 innings, 1 earned run, in Game 1 against the Braves" },
        ]}
      />
      <p>
        It came against a team that had the Dodgers&rsquo; number all season. Atlanta won five of the six regular-season
        meetings between the two clubs, the kind of lopsided series that usually gets cited as a reason to pick the
        underdog in October. None of that carried over to Saturday. Dylan Dodd started for the Braves and matched
        Skubal for much of the night before the Dodgers&rsquo; lineup broke through.
      </p>
      <p>
        Teoscar Hern&aacute;ndez put the Dodgers ahead with a two-run homer in the fourth. Atlanta answered with a
        Sean Murphy solo shot in the sixth, but Los Angeles pulled away in the same inning: Kyle Tucker followed with
        a two-run homer of his own, and Max Muncy added a solo shot to make it 5-1. Ozzie Albies&rsquo; two-run homer
        in the ninth, with Ronald Acu&ntilde;a Jr. aboard, was the Braves&rsquo; last word, cutting the final margin to
        two. By then Skubal was long out of the game, and three Dodgers home runs already stood as the difference.
      </p>
      <p>
        The stakes behind the box score are what make this more than one good start. The Dodgers have won the last
        two World Series, beating the Yankees in five games in 2024 for the franchise&rsquo;s eighth title, then
        outlasting the Blue Jays in an 11-inning Game 7 last November for a ninth, the first time any team had
        repeated as champion since the Yankees won three straight from 1998 to 2000. A third consecutive title this
        year would match that Yankees run outright, and the front office&rsquo;s trade-deadline bet on Skubal was made
        with exactly this kind of October start in mind.
      </p>
      <DodgersWorldSeriesStreakChart
        data={[
          { value: "2024", label: "Beat the Yankees", note: "4 games to 1, the franchise's 8th World Series title" },
          { value: "2025", label: "Beat the Blue Jays", note: "11 innings, Game 7, first repeat champs since 1998-2000" },
          { value: "2026", label: "Chasing a three-peat", note: "Would tie the Yankees' 1998-2000 run for the last one" },
        ]}
      />
      <p>
        Game 2 is Monday night back at Dodger Stadium, with the series shifting to Atlanta for Game 3 if it is still
        going by midweek. A sweep is a long way off, but a trade-deadline ace who needed one start to look worth
        every prospect the Dodgers gave up for him is the kind of result a team chasing history wants from its newest
        arm.
      </p>
    </>
  ),
};
