import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { AghaPresidentsTrophyChart } from "@/components/AghaPresidentsTrophyChart";
import { PresidentsTrophySeasonTopScoresChart } from "@/components/PresidentsTrophySeasonTopScoresChart";

export const article: BeyondTheScorelineArticle = {
  slug: "agha-fazal-two-triple-hundreds-presidents-trophy",
  title: "Agha's 300, Fazal's 309: Pakistan's Triple-Century Season",
  dek: "Salman Agha's unbeaten 300 at Abbottabad and Abdullah Fazal's unbeaten 309 two weeks later have given this President's Trophy season two triple centuries, both from batters recently dropped by Pakistan's Test side, with State Bank of Pakistan unbeaten atop the table ahead of this month's final.",
  publishedAt: "2026-10-16",
  readingMinutes: 5,
  tags: ["cricket", "presidents-trophy", "pakistan-cricket"],
  art: { number: "2", caption: "triple hundreds in one President's Trophy season, both unbeaten" },
  relatedLinks: [
    {
      label: "President's Trophy 2026-27",
      href: "/cricket/series/8836-2026-27",
      description: "Points table, results and series stats",
    },
    {
      label: "Hyderabad Kingsmen Academy vs IS Markhor IT Solutions, 2nd Match",
      href: "/cricket/matches/1553778",
      description: "Full scorecard from Abbottabad Cricket Stadium",
    },
    {
      label: "Fazal's 309 Not Out Headlines the President's Trophy",
      href: "/beyond-the-scoreline/fazal-309-presidents-trophy-record-stand",
      description: "Beyond the Scoreline's report on the season's highest score",
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
        Pakistan&rsquo;s President&rsquo;s Trophy has produced two unbeaten triple centuries this season, two weeks
        apart, from two batters who had each just been dropped by the Test side. Salman Agha made the first, an
        unbeaten 300 for Hyderabad Kingsmen Academy against IS Markhor IT Solutions at Abbottabad Cricket Stadium
        on September 12. Abdullah Fazal went past it less than two weeks later, finishing unbeaten on 309 for
        State Bank of Pakistan against Ghani at the National Ground in Islamabad.
      </p>
      <AghaPresidentsTrophyChart
        data={[
          { value: "300*", label: "Agha's unbeaten score", note: "336 balls, 42 fours, 6 sixes, his maiden first-class triple century" },
          { value: "274", label: "Fourth-wicket stand with Mohammad Suleman", note: "Suleman made 115, after Kingsmen had slipped to 72 for 3" },
          { value: "565/7d", label: "Kingsmen's declared total", note: "Built almost entirely after Agha's dismissal rescue act" },
          { value: "6/79", label: "Akif Javed's return for Markhor", note: "Six of the seven wickets that fell as Kingsmen batted to 565" },
        ]}
      />
      <p>
        Agha&rsquo;s innings carried more than a season-high number. He had captained Pakistan in the first Test
        of their England tour at Headingley, standing in after Babar Azam was hurt in the team&rsquo;s warm-up
        match, and managed just 21 and 4 with the bat. He was released from the Test squad during that series and
        did not play again, missing both Lord&rsquo;s and Edgbaston as England went on to win 3-0. His previous
        highest first-class score was 169. Coming in with Kingsmen reduced to 72 for 3, he batted for 336 balls,
        added 274 for the fourth wicket with Mohammad Suleman and another 118 for the sixth with Mohammad Shayan,
        and turned a shaky morning into a total Markhor IT Solutions never threatened: following on at 330, they
        were bowled out again for 384, and the match was drawn.
      </p>
      <p>
        Fazal&rsquo;s innings, two weeks later, pushed the season&rsquo;s benchmark higher still. He faced 339
        balls for his unbeaten 309, hit 29 fours and 11 sixes, and put on 417 for State Bank of Pakistan&rsquo;s
        first wicket with Hasan Raza, who made 222, the third-highest opening stand in Pakistan&rsquo;s first-class
        history. SBP declared on 638 for 5 and bowled Ghani out twice to win by an innings and 18 runs. Like Agha,
        Fazal was playing his way back into contention: a back injury picked up after his Test debut had cost him
        Pakistan&rsquo;s tours of the West Indies and England, and the Ghani match was his first innings back from
        it.
      </p>
      <PresidentsTrophySeasonTopScoresChart
        data={[
          { player: "Abdullah Fazal", team: "State Bank of Pakistan", runs: 309, note: "unbeaten, 9th Match vs Ghani", highlight: true },
          { player: "Salman Agha", team: "Hyderabad Kingsmen Academy", runs: 300, note: "unbeaten, 2nd Match vs Markhor IT Solutions", highlight: true },
          { player: "Mohammad Taha", team: "Pakistan Television", runs: 225, note: "season high, part of 714 runs this competition" },
          { player: "Hasan Raza", team: "State Bank of Pakistan", runs: 222, note: "in the same innings as Fazal's 309*" },
          { player: "Mohammad Suleman", team: "Hyderabad Kingsmen Academy", runs: 182, note: "season high, in a separate innings" },
        ]}
      />
      <p>
        That gap says how unusual the two triple hundreds are. Mohammad Taha&rsquo;s 225 for Pakistan Television,
        the next-best score of the season, is 84 runs short of Agha and 75 short of Fazal; nobody outside that top
        three has passed 182. Getting there took two different batting line-ups, in two different matches, each
        needing one batter to play the best innings of his career inside a fortnight of the other.
      </p>
      <p>
        Neither innings has settled the title race by itself. State Bank of Pakistan remain unbeaten, with two
        wins and four draws worth 95 points from six matches, top of the table heading into the league stage&rsquo;s
        final round on October 19. Agha&rsquo;s 565 for 7 only earned Hyderabad Kingsmen Academy a draw, and they
        sit sixth on 66 points, 29 behind the leaders. Taha&rsquo;s 714 runs and Khan Research Laboratories&rsquo;
        Arshad Iqbal, with 27 wickets, lead the competition&rsquo;s other two leaderboards heading into the final at
        the end of the month. Whoever joins State Bank of Pakistan there on October 24, the number the season will
        be remembered by is already set: two triple hundreds, both unbeaten, a fortnight apart.
      </p>
    </>
  ),
};
