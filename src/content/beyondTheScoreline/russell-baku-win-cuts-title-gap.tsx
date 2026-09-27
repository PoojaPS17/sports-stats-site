import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { F1DriversStandingsChart } from "@/components/F1DriversStandingsChart";

export const article: BeyondTheScorelineArticle = {
  slug: "russell-baku-win-cuts-title-gap",
  title: "Russell's Baku Win Trims Mercedes' Title Gap",
  dek: "George Russell's third win of the season, in Baku, cut Kimi Antonelli's championship lead from 81 points to 66, with eight rounds still to run.",
  publishedAt: "2026-09-27",
  readingMinutes: 3,
  tags: ["f1", "mercedes", "russell"],
  relatedLinks: [
    {
      label: "F1 drivers' standings 2026",
      href: "/f1/standings",
      description: "Full points table, updated after every race",
    },
    {
      label: "Kimi Antonelli",
      href: "/f1/drivers/kimi-antonelli",
      description: "Race-by-race results and season history",
    },
  ],
  body: () => (
    <>
      <p>
        Kimi Antonelli clipped the wall in Q1 on Saturday and started the Azerbaijan Grand Prix sixteenth. He
        finished it fifth, and called it his worst weekend of the season afterward.
      </p>
      <p>
        George Russell had the better one. He took pole off Charles Leclerc, then held off Max Verstappen to win his
        third race of the year.
      </p>
      <p>
        That result cut straight into his teammate&rsquo;s championship lead. Antonelli went into the weekend 81
        points clear of Russell. He left it 66 points clear, Russell&rsquo;s win alone worth 15 points of the gap.
        Eight rounds remain.
      </p>
      <F1DriversStandingsChart
        round={15}
        totalRounds={23}
        data={[
          { driver: "Antonelli", points: 302, wins: 8 },
          { driver: "Russell", points: 236, wins: 3 },
          { driver: "Hamilton", points: 199, wins: 0 },
          { driver: "Norris", points: 186, wins: 0 },
          { driver: "Leclerc", points: 179, wins: 0 },
          { driver: "Verstappen", points: 163, wins: 0 },
        ]}
      />
      <p>
        The two Mercedes drivers hold first and second. Lewis Hamilton is third for Ferrari on 199, ahead of Lando
        Norris on 186 and Charles Leclerc on 179. Max Verstappen sits sixth on 163, still without a win this year.
        It&rsquo;s a sharp reversal for a four-time champion who has usually contended for wins, not points finishes.
      </p>
      <p>
        Antonelli, in his second full F1 season, built his lead by winning eight of the first fourteen races. Baku is
        the first time Russell has meaningfully cut into it. Whether that continues starts at the rescheduled
        Bahrain Grand Prix on October 4, run at Sepang after the original Sakhir date was cancelled.
      </p>
    </>
  ),
};
