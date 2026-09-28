import Link from "next/link";
import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { ShootingMedalsByEditionChart } from "@/components/ShootingMedalsByEditionChart";

export const article: BeyondTheScorelineArticle = {
  slug: "second-gold-asian-record",
  title: "India's Second Gold Comes With an Asian Record in Shooting",
  dek: "Suruchi Singh and Kamaljeet broke an Asian Games record to win India's second gold. Shooting has now delivered ten of India's twenty-three medals.",
  publishedAt: "2026-09-25",
  readingMinutes: 2,
  tags: ["asian-games", "shooting", "india"],
  art: { number: "10", caption: "of India's 23 medals at these Games have come from shooting", palette: "asian-games" },
  relatedLinks: [
    {
      label: "Asian Games medal tally, 2026 and every edition back to 1951",
      href: "/asian-games/medal-tally",
      description: "Full country-by-country table, updated as results come in",
    },
    {
      label: "Asian Games hub",
      href: "/asian-games",
      description: "Host dates, India's live cricket fixtures, and the edition overview",
    },
  ],
  dataAttribution: `Medal data from Wikipedia's "2026 Asian Games medal table", used under CC BY-SA 4.0.`,
  body: () => (
    <>
      <p>
        Suruchi Singh set her pistol down and checked the score herself: 484.6. It was an Asian Games record in the
        10m air pistol mixed team event. Paired with Kamaljeet, the record turned into gold: India&rsquo;s second of
        these Games.
      </p>
      <p>
        It didn&rsquo;t stand alone for long. Later on Friday, Aishwary Pratap Singh Tomar, Rudrankksh Patil and
        Niraj Kumar took silver in the men&rsquo;s 50m rifle three positions team. Elavenil Valarivan won silver in
        the individual 10m air rifle, then teamed with Sonam Uttam Maskar and Vidarsa Kochalumkal Vinod for another
        silver in that event&rsquo;s team competition. Four shooting medals landed in one day.
      </p>
      <p>
        India&rsquo;s overall tally now stands at <strong>23 medals</strong>: two gold, nine silver, twelve bronze.
        That&rsquo;s good for 12th on the <Link href="/asian-games/medal-tally">full medal table</Link>. Shooting
        has delivered ten of those twenty-three.
      </p>
      <p>
        That split isn&rsquo;t new. India&rsquo;s shooters won nine medals across the whole of the 2018
        Jakarta-Palembang Games. They&rsquo;ve already matched that here, with a week of competition still to go.
        Four years later in Hangzhou, shooting had its best Asian Games yet: twenty-two medals, seven of them gold.
        Aichi-Nagoya sits between the two so far, and Friday&rsquo;s record suggests the ceiling hasn&rsquo;t been
        found.
      </p>
      <ShootingMedalsByEditionChart
        data={[
          { edition: "2018", hostCity: "Jakarta-Palembang", total: 9, partial: false },
          { edition: "2022", hostCity: "Hangzhou", total: 22, partial: false },
          { edition: "2026", hostCity: "Aichi-Nagoya", total: 10, partial: true },
        ]}
      />
      <p>
        Across every Asian Games India has shot in, the tally now reads <strong>82 medals</strong>: sixteen gold,
        thirty-two silver, thirty-four bronze. The shooting program here runs through October 1. There&rsquo;s
        still time to add to both numbers.
      </p>
    </>
  ),
};
