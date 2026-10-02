import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { AsianGamesSwimmingGoldsChart } from "@/components/AsianGamesSwimmingGoldsChart";
import { ChinaSwimmingGoldsByEditionChart } from "@/components/ChinaSwimmingGoldsByEditionChart";

export const article: BeyondTheScorelineArticle = {
  slug: "zhang-zhanshuo-seven-golds-asian-games",
  title: "Zhang Zhanshuo's Record Seven Asian Games Golds",
  dek: "Zhang Zhanshuo won seven swimming golds at the 2026 Asian Games, breaking teammate Zhang Yufei's own record of six, as China topped the pool medal table again.",
  publishedAt: "2026-10-02",
  readingMinutes: 4,
  tags: ["asian-games", "swimming", "china"],
  art: { number: "7", caption: "golds for Zhang Zhanshuo, more than any swimmer at one Asian Games before him" },
  relatedLinks: [
    {
      label: "Asian Games medal tally, 2026 and every edition back to 1951",
      href: "/asian-games/medal-tally",
      description: "Full country-by-country table, updated as results come in",
    },
    {
      label: "Asian Games hub",
      href: "/asian-games",
      description: "Host dates, live fixtures and the edition overview",
    },
  ],
  body: () => (
    <>
      <p>
        Zhang Zhanshuo touched the wall first in the men&rsquo;s 400m freestyle on the final day of swimming at the
        Aichi-Nagoya Asian Games, and with it became the first swimmer in the history of the Games to win seven gold
        medals at a single edition. He had already won the 200m, 800m and 1,500m freestyle, plus three relays, before
        that last individual final on September 25.
      </p>
      <p>
        The record he broke belonged to his own teammate. Zhang Yufei had set the previous mark of six golds at the
        2022 Asian Games in Hangzhou. Zhang Zhanshuo&rsquo;s seven came from a mix of individual and relay swimming:
        the 200m, 400m, 800m and 1,500m freestyle, the men&rsquo;s 4x100m and 4x200m freestyle relays, and the mixed
        4x100m medley relay.
      </p>
      <AsianGamesSwimmingGoldsChart
        data={[
          { athlete: "Zhang Zhanshuo", country: "China", gold: 7, edition: "2026 Aichi-Nagoya", highlight: true },
          { athlete: "Zhang Yufei", country: "China", gold: 6, edition: "2022 Hangzhou" },
        ]}
      />
      <p>
        The number that stands out most is not the medal count but the clock. Zhang&rsquo;s winning time in the 400m
        freestyle, 3 minutes 41.28 seconds, was an Asian Games record and only 1.30 seconds slower than the world
        record of 3:39.98 held by Germany&rsquo;s Lukas Martens. A continental sweep built largely on distance
        freestyle would mean little if the times weren&rsquo;t competitive on the clock that actually matters, and
        Zhang&rsquo;s was.
      </p>
      <p>
        China&rsquo;s swimmers were not relying on one man. The team won 30 gold medals and 54 medals in total across
        six days in the pool at Aichi-Nagoya, up from 28 golds at the 2022 Games in Hangzhou. Japan&rsquo;s Shin
        Ohashi provided the meet&rsquo;s other headline swim, a world record in the men&rsquo;s 200m breaststroke, but
        the gold count in the pool still ran heavily through the Chinese team.
      </p>
      <ChinaSwimmingGoldsByEditionChart
        data={[
          { edition: "2022", hostCity: "Hangzhou", gold: 28 },
          { edition: "2026", hostCity: "Aichi-Nagoya", gold: 30 },
        ]}
      />
      <p>
        Zhang Yufei, the swimmer whose own record had just been broken, had a big meet of her own rather than a
        quiet one. She won the women&rsquo;s 50m butterfly, added a silver in the 100m butterfly, and picked up more
        relay gold alongside her teammates, continuing a run at this event that stretches back over a decade.
      </p>
      <p>
        Swimming wrapped up early in the Aichi-Nagoya program, but the wider Games run through October 4. Whatever
        happens on the track and in the other arenas before the closing ceremony, the record books in the pool now
        read seven golds for one swimmer at one Asian Games, a mark that belonged to a teammate barely three years
        earlier and now belongs to Zhang Zhanshuo alone.
      </p>
    </>
  ),
};
