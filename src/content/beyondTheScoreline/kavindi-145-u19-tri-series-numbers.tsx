import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { KavindiU19TriSeriesChart } from "@/components/KavindiU19TriSeriesChart";
import { U19TriSeriesTopScoresChart } from "@/components/U19TriSeriesTopScoresChart";

export const article: BeyondTheScorelineArticle = {
  slug: "kavindi-145-u19-tri-series-numbers",
  title: "Kavindi's 145 by the Numbers in the U19 Tri-Series",
  dek: "Sanjana Kavindi's unbeaten 90 off 59 balls, her second player-of-the-match innings in three days, has given Sri Lanka's wicketkeeper-batter 145 runs and the lead in Pakistan's Women's Under-19 T20 Tri-Series.",
  publishedAt: "2026-10-09",
  readingMinutes: 5,
  tags: ["cricket", "pakistan-womens-u19-tri-series", "sri-lanka-cricket"],
  art: { number: "145", caption: "runs for Sri Lanka's Kavindi, the U19 tri-series' leading scorer, average 72.5" },
  relatedLinks: [
    {
      label: "Pakistan Women's U19 Tri-Series 2026/27",
      href: "/cricket/series/1554704",
      description: "Points table, results and series stats",
    },
    {
      label: "Bangladesh vs Sri Lanka, 5th Match",
      href: "/cricket/matches/1554711",
      description: "Full scorecard of Kavindi's 90* from Iqbal Stadium, Faisalabad",
    },
    {
      label: "Bangladesh vs Sri Lanka, 3rd Match",
      href: "/cricket/matches/1554709",
      description: "Kavindi's first player-of-the-match innings, three days earlier",
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
        Sanjana Kavindi faced 59 balls at Iqbal Stadium in Faisalabad and finished unbeaten on 90, steering Sri
        Lanka Women Under-19 past Bangladesh with five balls to spare. It was her second player-of-the-match award
        in three days, and it left her clear at the top of the run charts in the Pakistan Women&rsquo;s Under-19 T20
        Tri-Series.
      </p>
      <KavindiU19TriSeriesChart
        data={[
          { value: "90*", label: "Kavindi's unbeaten score, 5th Match vs Bangladesh", note: "59 balls, 13 fours and two sixes, strike rate 152.5" },
          { value: "145", label: "Runs in the tri-series, from three innings", note: "Average of 72.5, the competition's leading run scorer" },
          { value: "2", label: "Player-of-the-match awards in three days", note: "48 off 46 on October 5, then 90* off 59 on October 8" },
          { value: "6 wkts", label: "Margin of Sri Lanka's win in the 5th Match", note: "Chased a target of 127 with five balls remaining" },
        ]}
      />
      <p>
        She had done almost the same thing three days earlier, on the same ground, against the same opponent.
        Bangladesh set 120 to win in the 3rd Match, and Kavindi, batting at the top of the order as Sri Lanka&rsquo;s
        wicketkeeper, made 48 off 46 balls with four fours and two sixes. Sri Lanka got there with nothing to spare,
        120 for 6, the scores level until the final delivery of the innings. Two matches, two rescue jobs, the same
        rival both times.
      </p>
      <p>
        The tri-series opened on October 2 with Bangladesh beating the hosts, Pakistan, by 30 runs, and Pakistan
        have had a mixed week since. They beat Sri Lanka in the 2nd Match, the one game in which Kavindi failed,
        run out for 7 off 6 balls, with Komal Khan&rsquo;s 50 getting Pakistan home. But Pakistan then lost to
        Bangladesh again by 13 runs in the 4th Match, leaving all three sides with at least one win and one defeat
        heading into the second half of the group phase.
      </p>
      <U19TriSeriesTopScoresChart
        data={[
          { player: "Sanjana Kavindi", team: "Sri Lanka U19", runs: 145, note: "Three innings, average 72.5, two player-of-the-match awards", highlight: true },
          { player: "Komal Khan", team: "Pakistan U19", runs: 115, note: "Includes 50 off 39 in the 2nd Match win over Sri Lanka" },
          { player: "Sadia Akter", team: "Bangladesh U19", runs: 101 },
          { player: "Sadia Islam", team: "Bangladesh U19", runs: 86, note: "39 off 22 in the 3rd Match defeat to Sri Lanka" },
          { player: "Nishita Akter Nishi", team: "Bangladesh U19", runs: 84, note: "Also among the tri-series' leading wicket takers" },
        ]}
      />
      <p>
        That gap matters more than it looks. Kavindi&rsquo;s 145 runs have come from three innings, fewer than
        anyone else in the top five, and she has been dismissed only twice. The next best, Pakistan&rsquo;s Komal
        Khan, has needed a wider spread of innings to get to 115. No one else in the competition is within 30 runs
        of Kavindi, and nobody has been out less often while scoring more.
      </p>
      <p>
        The bowling has stayed tight even as Kavindi has dominated. Pakistan&rsquo;s Mahnoor Zeb and
        Bangladesh&rsquo;s Farjana Easmin share the lead with six wickets apiece, Farjana&rsquo;s best figures 3 for
        25, and Bangladesh&rsquo;s Nishita Akter Nishi is level with them on six wickets while also sitting fifth on
        the run charts. On points, Bangladesh lead with four points from four matches, just ahead of Sri Lanka, who
        also have four points but from one fewer game and a worse net run rate, 0.016 to Bangladesh&rsquo;s 0.439.
        Pakistan sit third on two points from three matches.
      </p>
      <p>
        Sri Lanka and Pakistan meet again in the 6th Match on October 9, a rematch of the game in which Kavindi
        made her only low score, before two more fixtures against each side and the final on October 16. If Sri
        Lanka are going to close the net-run-rate gap on Bangladesh and reach that final, the form of a teenage
        wicketkeeper who has now rescued two chases in three days looks like the reason why.
      </p>
    </>
  ),
};
