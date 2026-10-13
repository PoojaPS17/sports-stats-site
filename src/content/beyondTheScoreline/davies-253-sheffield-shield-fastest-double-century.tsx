import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { DaviesSheffieldShieldChart } from "@/components/DaviesSheffieldShieldChart";
import { SheffieldShieldTopScoresChart } from "@/components/SheffieldShieldTopScoresChart";

export const article: BeyondTheScorelineArticle = {
  slug: "davies-253-sheffield-shield-fastest-double-century",
  title: "Davies' 253: The Sheffield Shield by the Numbers",
  dek: "Ollie Davies made 253 off 225 balls for New South Wales against Tasmania, reaching his double century off 186 deliveries, the fastest in Sheffield Shield history, in a round one that also saw Xavier Bartlett take nine wickets and still finish on the losing side.",
  publishedAt: "2026-10-13",
  readingMinutes: 5,
  tags: ["cricket", "sheffield-shield", "new-south-wales"],
  art: { number: "253", caption: "runs for Davies, off a double century reached faster than any in Shield history" },
  relatedLinks: [
    {
      label: "Sheffield Shield 2026-27",
      href: "/cricket/series/8043-2026-27",
      description: "Points table, results and series stats",
    },
    {
      label: "New South Wales vs Tasmania, 2nd Match",
      href: "/cricket/matches/1544865",
      description: "Full scorecard from Cricket Central, Sydney",
    },
    {
      label: "Western Australia vs Queensland, 3rd Match",
      href: "/cricket/matches/1544866",
      description: "Full scorecard from the WACA Ground, Perth",
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
        Ollie Davies faced 225 balls at Cricket Central in Sydney and was out for 253, caught in the deep off
        Mitchell Prestwidge having long since passed every total he had managed in a first-class match before. It
        came in New South Wales&rsquo; 2nd Match of the Sheffield Shield, the competition&rsquo;s season opener
        against Tasmania, and it put NSW on 500 for 9 declared after Tasmania had been bowled out for 245.
      </p>
      <DaviesSheffieldShieldChart
        data={[
          { value: "253", label: "Davies' score, off 225 balls", note: "38 fours and 4 sixes, caught in the deep off Prestwidge" },
          { value: "186", label: "Balls to reach his double century", note: "The fastest 200 in Sheffield Shield history" },
          { value: "500/9d", label: "NSW's declared first-innings total", note: "After bowling Tasmania out for 245" },
          { value: "1st in 9", label: "NSW Shield double-centuries, by season", note: "The first by an NSW batter in nine Shield seasons" },
        ]}
      />
      <p>
        Davies was dropped from the NSW side before Christmas last season after averaging 13.66 across five
        matches batting at five. Coach Brad Haddin&rsquo;s fix was to move him to the top of the order, and the
        change has turned a fringe middle-order batter into an opener good enough to bat an entire day. No NSW
        batter had scored 200 runs in a single day of a first-class match since Simon Katich managed it in
        2007-08, and Davies got there with support: his opening partner Jack Edwards made 115 off 182 balls, and
        the pair put NSW in position to bat Tasmania out of the game before a ball of the Shield season was a
        week old.
      </p>
      <p>
        Tasmania&rsquo;s collapse in the first innings owed as much to Jake Scott as to Davies&rsquo; runs. The
        21-year-old leg-spinner took 5 for 35 to bowl Tasmania out for 245, setting up the declaration that gave
        Davies his platform. Tasmania followed on, but Caleb Jewell&rsquo;s 88 and Tim Ward&rsquo;s 83 helped them
        bat out 153 overs for 402 for 5 and salvage a draw, denying NSW the outright win their first innings had
        all but guaranteed.
      </p>
      <SheffieldShieldTopScoresChart
        data={[
          { player: "Ollie Davies", team: "New South Wales", runs: 253, note: "2nd Match vs Tasmania, caught in the deep off Prestwidge", highlight: true },
          { player: "Caleb Jewell", team: "Tasmania", runs: 138, note: "across two innings in the same match" },
          { player: "Noah McFadyen", team: "South Australia", runs: 134, note: "1st Match vs Victoria" },
          { player: "Ben Manenti", team: "South Australia", runs: 128, note: "1st Match vs Victoria" },
          { player: "Tim Ward", team: "Tasmania", runs: 121, note: "across two innings vs New South Wales" },
        ]}
      />
      <p>
        Davies&rsquo; 253 is almost twice the next-highest score from round one, and nobody else in the opening
        three matches passed 140. That gap is the clearest sign of how far outside the ordinary his innings sits,
        even in a round that had no shortage of runs: Noah McFadyen and Ben Manenti both passed 125 as South
        Australia beat Victoria by an innings in Melbourne.
      </p>
      <p>
        The round&rsquo;s other story ran the opposite way. At the WACA, Queensland&rsquo;s Xavier Bartlett took 5
        for 48 in Western Australia&rsquo;s first innings and 4 for 53 in the second, nine wickets in the match,
        and still ended up on the losing side. Queensland had led by 132 runs after the first innings, but their
        second innings folded for 68, and Western Australia chased down a target of 201 for the loss of eight
        wickets, Aaron Hardie unbeaten on 80 off 128 balls to see them home by two wickets. Jhye Richardson matched
        Bartlett&rsquo;s effort with 6 wickets of his own, including 5 for 19 in Queensland&rsquo;s second innings,
        in what cricket.com.au framed as two Test-squad hopefuls making their case in the same match.
      </p>
      <p>
        Round one leaves South Australia top of the table on 8.39 points from their innings win, with Western
        Australia second on 7 after their nerve-wracking chase. New South Wales sit third on 5 points for the
        draw, ahead of Tasmania on 2.35, Queensland on 2.07 and Victoria on 1.04 after their innings defeat. It is
        one round of ten before the final, far too early to read into the ladder, but Davies has already put his
        name alongside Katich&rsquo;s in the Shield&rsquo;s record of big days with the bat, and Queensland now
        know their best bowling week of the season bought them nothing.
      </p>
    </>
  ),
};
