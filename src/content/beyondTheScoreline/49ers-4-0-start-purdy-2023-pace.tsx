import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { FortyNinersByTheNumbersChart } from "@/components/FortyNinersByTheNumbersChart";
import { NFCWestStandingsChart } from "@/components/NFCWestStandingsChart";

export const article: BeyondTheScorelineArticle = {
  slug: "49ers-4-0-start-purdy-2023-pace",
  title: "49ers' Perfect Start Puts Purdy Back on His Best Pace",
  dek: "San Francisco's 4-0 start is the best record in the NFC West, Brock Purdy's early passing pace matches his career-best 2023 season, and Sunday brings a rematch of the playoff blowout that ended last season.",
  publishedAt: "2026-10-06",
  readingMinutes: 5,
  tags: ["nfl", "49ers", "nfc-west"],
  art: { number: "4-0", caption: "start for the 49ers, one of just three unbeaten teams left in the NFL" },
  relatedLinks: [
    {
      label: "NFL standings",
      href: "/nfl/standings",
      description: "Full 2026 season picture, updated after every week",
    },
    {
      label: "San Francisco 49ers",
      href: "/nfl/teams/san-francisco-49ers",
      description: "Full schedule, roster and season stats",
    },
    {
      label: "Brock Purdy",
      href: "/nfl/players/brock-purdy",
      description: "Game logs and career passing numbers",
    },
  ],
  body: () => (
    <>
      <p>
        San Francisco beat the Denver Broncos 24-14 on Sunday to finish the season&rsquo;s first quarter a perfect
        4-0, one of only three unbeaten teams left in the NFL. Kansas City and Minnesota are the other two. None of
        the three has looked more comfortable doing it than the 49ers, who have not trailed by more than a touchdown
        in any of their four games.
      </p>
      <p>
        All four wins have come by at least six points, three of them by double digits: 27-7 over the Los Angeles
        Rams in the opener, 35-13 over the Miami Dolphins, 36-30 over the Arizona Cardinals, and Sunday&rsquo;s win
        over Denver. Add it up and San Francisco has outscored its opponents 122-64, an average scoreline of 30.5 to
        16 a game.
      </p>
      <FortyNinersByTheNumbersChart
        data={[
          { value: "4-0", label: "Record", note: "No loss and no game decided by less than 6 points" },
          { value: "+58", label: "Point differential", note: "122 scored, 64 allowed through 4 games" },
          { value: "1,007", label: "Purdy passing yards", note: "251.8 yards per game, the best pace of his career" },
          { value: "27-7", label: "Week 1 win at the Rams", note: "L.A. has since fallen to 2-2 in the NFC West" },
        ]}
      />
      <p>
        Quarterback Brock Purdy is the biggest reason the offense has looked this sharp. He has thrown for 1,007
        yards through four games, a 251.8-yard-per-game pace that projects to 4,280 yards over a full 17-game
        season, which happens to be the exact total he threw for in 2023, his best season as a pro. That year he
        added 31 touchdowns and a 113.0 rating on the way to a 12-4 record. His yardage dropped to 3,864 in 2024 and
        to 2,167 last season, a down year by his own standard. Four games into 2026, he is throwing the ball like
        it is 2023 again.
      </p>
      <p>
        San Francisco&rsquo;s company atop the NFC West has not kept the same pace. Seattle is 3-1, the Rams are 2-2
        after that Week 1 loss to the 49ers, and Arizona is 1-3 following its own loss to San Francisco in Week 3.
        The 49ers are the division&rsquo;s only unbeaten team and have already beaten two of their three rivals.
      </p>
      <NFCWestStandingsChart
        asOf="October 6"
        data={[
          { team: "San Francisco 49ers", wins: 4, losses: 0, highlight: true },
          { team: "Seattle Seahawks", wins: 3, losses: 1 },
          { team: "Los Angeles Rams", wins: 2, losses: 2 },
          { team: "Arizona Cardinals", wins: 1, losses: 3 },
        ]}
      />
      <p>
        Sunday&rsquo;s trip to Seattle is the two sides&rsquo; first meeting since last January, when the Seahawks
        routed the 49ers 41-6 in the divisional round, ending a 2025 season that had started with a wild-card win
        over Philadelphia. If San Francisco&rsquo;s current record holds, 2026 projects as the best regular-season
        standing in the twelve seasons of franchise data sports-db.live tracks, ahead of a 13-3 campaign in 2019 that
        finished second in the NFC.
      </p>
      <p>
        The start has not come cheap. Defensive end Nick Bosa is out with a calf injury and fullback Kyle Juszczyk is
        dealing with a knee issue, both expected to miss extended time. The supporting cast has covered for it so
        far: Christian McCaffrey has 218 rushing yards, George Kittle 244 receiving yards and Deebo Samuel Sr. 185
        receiving yards through four games. Lumen Field on Sunday is the sternest test yet of whether a point
        differential this lopsided can hold up against the team that ended San Francisco&rsquo;s season nine months
        ago.
      </p>
    </>
  ),
};
