import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { U19TriSeriesFinalChart } from "@/components/U19TriSeriesFinalChart";
import { U19TriSeriesFinalRunLeadersChart } from "@/components/U19TriSeriesFinalRunLeadersChart";

export const article: BeyondTheScorelineArticle = {
  slug: "sri-lanka-4-run-u19-final-win",
  title: "The Numbers Behind Sri Lanka's 4-Run U19 Final",
  dek: "Sri Lanka Women's Under-19s held off Bangladesh by 4 runs in Friday's Pakistan Women's U19 Tri-Series final, with player-of-the-match Sanjana Kavindi's 64 sealing the title and stretching her tournament-leading tally to 316 runs.",
  publishedAt: "2026-10-17",
  readingMinutes: 5,
  tags: ["cricket", "pakistan-womens-u19-tri-series", "sri-lanka-cricket", "bangladesh-cricket"],
  art: { number: "4", caption: "runs between Sri Lanka and Bangladesh in the U19 Tri-Series final" },
  relatedLinks: [
    {
      label: "Pakistan Women's U19 Tri-Series 2026/27",
      href: "/cricket/series/1554704",
      description: "Points table, results and series stats",
    },
    {
      label: "Sri Lanka vs Bangladesh, Final",
      href: "/cricket/matches/1554716",
      description: "Full scorecard from Iqbal Stadium, Faisalabad",
    },
    {
      label: "Kavindi's 145 by the Numbers in the U19 Tri-Series",
      href: "/beyond-the-scoreline/kavindi-145-u19-tri-series-numbers",
      description: "Beyond the Scoreline's report from the group stage",
    },
    {
      label: "Cricket series",
      href: "/cricket/series",
      description: "Every international and domestic competition this site tracks",
    },
  ],
  body: () => (
    <>
      <p>
        Sri Lanka Women&rsquo;s Under-19s beat Bangladesh by 4 runs in Friday&rsquo;s final of the Pakistan
        Women&rsquo;s Under-19 T20 Tri-Series, defending 158 for 6 at Iqbal Stadium in Faisalabad after Bangladesh
        won the toss and chose to field. Sanjana Kavindi top-scored with 64 off 44 balls and was named player of the
        match, her third award of the tournament, and Bangladesh finished on 154 for 7, four runs short of the
        target.
      </p>
      <U19TriSeriesFinalChart
        data={[
          { value: "4 runs", label: "Sri Lanka's margin of victory in the final", note: "Chasing 159, Bangladesh closed on 154 for 7 after 20 overs" },
          { value: "64", label: "Kavindi's player-of-the-match innings", note: "44 balls, 7 fours and 2 sixes, strike rate 145.45" },
          { value: "316", label: "Kavindi's run tally for the tournament", note: "Six innings, average 63.2, the tri-series' leading scorer" },
          { value: "59", label: "Sadia Islam's reply for Bangladesh", note: "36 balls, 5 sixes, strike rate 163.88, the final's second-highest score" },
        ]}
      />
      <p>
        It is the third time this tournament Kavindi has taken the player-of-the-match award, and the biggest stage
        yet. She made 48 off 46 balls in a four-wicket win over Bangladesh on October 5, then an unbeaten 90 off 59
        three days later, both at the same ground. Those two innings helped carry Sri Lanka through a group stage in
        which their only defeat came against Pakistan, Komal Khan&rsquo;s 50 getting the hosts home. Sri Lanka
        finished top of the three-team table on 10 points from six games, a point and a net run rate clear of
        Bangladesh, who edged out Pakistan for the second final spot despite three defeats of their own.
      </p>
      <p>
        Bangladesh&rsquo;s chase never settled. Mymuna Naher was caught off Chamodhi Herath without scoring, and
        Achena Jannat fell the same way to Danodya Sewmini three balls later, both inside the first four overs.
        Nishita Akter Nishi top-scored early with a 33-ball 32 before she was run out, and Shirina Khatun lasted only
        seven balls. Sadia Islam then counterattacked, hitting five sixes in a 36-ball 59 at better than 16 an over,
        and Sadia Akter&rsquo;s 35 off 22, three more sixes, kept the equation alive into the final overs. Chamudi
        Praboda, the pick of Sri Lanka&rsquo;s bowlers at 2 for 17 from her four overs, had both Khatun and Islam,
        and a second run-out, of Farjana Easmin, ended Bangladesh&rsquo;s hopes four runs short.
      </p>
      <p>
        Kavindi&rsquo;s innings means she finishes the tournament with 316 runs, and the gap to the rest of the
        field says how far clear of everyone else she was.
      </p>
      <U19TriSeriesFinalRunLeadersChart
        data={[
          { player: "Sanjana Kavindi", team: "Sri Lanka U19", runs: 316, note: "6 innings, average 63.2, high score 90* not out", highlight: true },
          { player: "Komal Khan", team: "Pakistan U19", runs: 181, note: "5 innings, high score 54" },
          { player: "Sadia Akter", team: "Bangladesh U19", runs: 153, note: "6 innings, high score 35" },
          { player: "Vimoksha Balasuriya", team: "Sri Lanka U19", runs: 146, note: "7 innings, high score 43*" },
          { player: "Sadia Islam", team: "Bangladesh U19", runs: 145, note: "6 innings, high score 59, set in the final" },
        ]}
      />
      <p>
        Komal Khan&rsquo;s 181 for Pakistan, from five innings, is the next best, 135 runs back, and nobody else
        from either side reached 155. Pakistan, who hosted the tri-series but finished third in the group stage and
        missed the final, can point to Khan&rsquo;s form as one bright spot from a difficult few weeks. For Sri
        Lanka, the title caps a tournament in which their teenage wicketkeeper was the headline act from the first
        match to the last, and Friday&rsquo;s 64 under the pressure of a final was the most emphatic answer yet to
        whether she could do it when the trophy was actually on the line.
      </p>
    </>
  ),
};
