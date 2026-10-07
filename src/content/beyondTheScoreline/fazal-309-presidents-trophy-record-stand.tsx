import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { FazalPresidentsTrophyChart } from "@/components/FazalPresidentsTrophyChart";
import { PresidentsTrophyTopScoresChart } from "@/components/PresidentsTrophyTopScoresChart";

export const article: BeyondTheScorelineArticle = {
  slug: "fazal-309-presidents-trophy-record-stand",
  title: "Fazal's 309 Not Out Headlines the President's Trophy",
  dek: "Abdullah Fazal's unbeaten 309, built with a 417-run opening stand with Hasan Raza, the third-highest in Pakistan's first-class history, sent State Bank of Pakistan top of the President's Trophy table.",
  publishedAt: "2026-10-07",
  readingMinutes: 5,
  tags: ["cricket", "presidents-trophy", "pakistan-cricket"],
  art: { number: "309*", caption: "Abdullah Fazal's unbeaten score, his maiden first-class triple century" },
  relatedLinks: [
    {
      label: "President's Trophy 2026-27",
      href: "/cricket/series/8836-2026-27",
      description: "Points table, results and series stats",
    },
    {
      label: "Ghani vs State Bank of Pakistan, 9th Match",
      href: "/cricket/matches/1553785",
      description: "Full scorecard from National Ground, Islamabad",
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
        Abdullah Fazal faced 339 balls at the National Ground in Islamabad and finished unbeaten on 309, the first
        triple century of his first-class career. It came in State Bank of Pakistan&rsquo;s 9th Match of the
        President&rsquo;s Trophy, and it buried Ghani. SBP declared on 638 for 5, bowled Ghani out for 322 and 298,
        and won by an innings and 18 runs.
      </p>
      <p>
        He hit 29 fours and 11 sixes along the way. He did not do it alone. His opening partner, Hasan Raza,
        made 222 off 221 balls with 31 fours and two sixes, and the pair put on 417 for the first wicket before Raza
        was caught behind off Abuzar. Multiple Pakistani outlets reported it as the third-highest opening stand in
        the country&rsquo;s first-class history, a number that puts Fazal&rsquo;s own 309 in perspective: he faced
        barely a third of the partnership&rsquo;s deliveries once Raza had gone, and still had enough left to bat
        SBP&rsquo;s whole innings away from danger.
      </p>
      <FazalPresidentsTrophyChart
        data={[
          { value: "309*", label: "Fazal's unbeaten score", note: "339 balls, 29 fours, 11 sixes, his maiden first-class triple century" },
          { value: "417", label: "Opening stand with Hasan Raza", note: "Third-highest opening partnership in Pakistan first-class history" },
          { value: "638/5d", label: "SBP's declared total", note: "After Ghani had made 322 batting first" },
          { value: "Inns & 18", label: "Margin of victory", note: "Ghani followed on and were bowled out for 298" },
        ]}
      />
      <p>
        The innings means more than a number on a Grade-I scorecard. Fazal made his Test debut for Pakistan against
        Bangladesh in May, scoring twin half-centuries in the first match before a quiet second Test. He was picked
        for the tour of the West Indies that followed, then injured his lower back in a training session at the
        Brian Lara Cricket Academy in Tarouba and missed both that series and the England tour that came after it.
        The Ghani match was his first innings back. A maiden triple century is as emphatic a way as any to tell
        selectors a back injury has not slowed him down.
      </p>
      <p>
        Kashif Bhatti did the early work with the ball, taking 3 for 21 to help bowl Ghani out for 322 in the first
        innings. Facing an innings deficit of 316 after SBP&rsquo;s declaration, Ghani batted again and lasted into
        the fourth day before folding for 298, handing SBP the biggest win of the tournament so far and their
        second win of the season, with no losses to go alongside it.
      </p>
      <PresidentsTrophyTopScoresChart
        data={[
          { player: "Abdullah Fazal", team: "State Bank of Pakistan", runs: 309, note: "unbeaten, 9th Match vs Ghani", highlight: true },
          { player: "Mohammad Taha", team: "Pakistan Television", runs: 225, note: "season-high score, part of 638 runs this competition" },
        ]}
      />
      <p>
        That result put State Bank of Pakistan on top of the President&rsquo;s Trophy table, with 72 points from
        five matches and no losses, ahead of Ghani on 66 and Hyderabad Kingsmen Academy on 55. Mohammad Taha of
        Pakistan Television still leads the competition&rsquo;s overall run charts with 638 across six innings, and
        Mohammad Ilyas of Hyderabad Kingsmen Academy tops the wicket-takers with 20, but neither has had a single
        afternoon like the one Fazal and Raza shared in Islamabad.
      </p>
      <p>
        SBP are back in action against Khan Research Laboratories in a fixture that began October 6, with the rest
        of the league phase still to come before the top two sides meet in the five-day final later this month. For
        now, the number that matters is 309, not out, next to a name that was supposed to be resting a sore back.
      </p>
    </>
  ),
};
