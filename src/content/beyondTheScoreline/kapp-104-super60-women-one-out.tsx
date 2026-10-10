import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { KappSuper60Chart } from "@/components/KappSuper60Chart";
import { Super60WomenTopRunsChart } from "@/components/Super60WomenTopRunsChart";

export const article: BeyondTheScorelineArticle = {
  slug: "kapp-104-super60-women-one-out",
  title: "Kapp's 104, One Out: Super60 Women by the Numbers",
  dek: "Marizanne Kapp went through two innings of the Canada Super60 Women unbeaten, then fell for 16, her only dismissal of the tournament, as Toronto Sixers Women chased down Vancouver Warriors to defend their title.",
  publishedAt: "2026-10-10",
  readingMinutes: 5,
  tags: ["cricket", "canada-super60-women", "toronto-sixers"],
  art: { number: "104", caption: "runs for Kapp in the Super60 Women, undone by her only dismissal, in the final" },
  relatedLinks: [
    {
      label: "Canada Super60 Women 2026-27",
      href: "/cricket/series/1556872-2026-27",
      description: "Points table, results and tournament stats",
    },
    {
      label: "Final: Vancouver Warriors vs Toronto Sixers",
      href: "/cricket/matches/1556880",
      description: "Full scorecard from BC Place, Vancouver",
    },
    {
      label: "1st Match: Vancouver Warriors vs Toronto Sixers",
      href: "/cricket/matches/1556876",
      description: "Kapp's unbeaten 74 off 31 balls, the tournament's top score",
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
        Marizanne Kapp had not been out once in the Canada Super60 Women, not through an unbeaten 74 in the
        tournament opener and not through a breezy 14 in the next round. Then, with Vancouver Warriors Women batting
        first in the final, Indu Barma found an edge and Mady Villiers took the catch. Kapp was gone for 16, her only
        dismissal of the whole competition, and it came in the one match that decided the title. Toronto Sixers
        Women chased down 85 with six wickets and three balls to spare to retain the trophy they won a year earlier.
      </p>
      <KappSuper60Chart
        data={[
          {
            value: "104",
            label: "Kapp's runs across the Super60 Women, from three innings",
            note: "Out only once, for an average of 104.00 and a strike rate of 221.28",
          },
          {
            value: "74*",
            label: "Unbeaten in the tournament opener, September 29",
            note: "31 balls, six fours and six sixes, strike rate 238.70, in a 7-wicket win over the Sixers",
          },
          {
            value: "16",
            label: "Her score in the final, the only time she was out",
            note: "c Villiers b Barma, as Vancouver batted first and set 85 to win",
          },
          {
            value: "6 wkts",
            label: "Toronto's winning margin in the final",
            note: "Reached 85 with 3 balls to spare, Ella McCaughan unbeaten on 36",
          },
        ]}
      />
      <p>
        It was the second season of the three-team women&rsquo;s competition at BC Place in Vancouver, and it ended
        exactly as the first one did: the Sana Mir Trophy going back to Toronto. The Sixers did not have the easier
        route there. They opened with a 7-wicket loss to Kapp&rsquo;s Warriors, then had to beat Vancouver Anchors
        Women twice, in the 2nd Match and again in the eliminator, just to earn a second shot at the team that had
        already beaten them once. Warriors, by contrast, won their two league games outright and went straight
        through to the final without playing the eliminator at all.
      </p>
      <p>
        Kapp is not a name you would expect to find atop a three-team T10 tournament in Vancouver. She made South
        Africa&rsquo;s first Women&rsquo;s World Cup century at the 2013 ODI World Cup, and by the end of that
        tournament she already had more than 3,500 international runs and over 200 wickets to her name. She has
        played in the WPL for Delhi Capitals since the league&rsquo;s first season in 2023, and lost three WPL
        finals with them, plus the 2025 World Cup final to India. Vancouver&rsquo;s BC Place is a long way from
        Mumbai or the World Cup final in India, but this final followed a pattern she already knows well: she did
        almost everything right across the tournament, and the team still came up one match short.
      </p>
      <p>
        Toronto&rsquo;s chase was never entirely comfortable. Mady Villiers, Bess Heath and Sterre Kalis went for 9,
        2 and 9 respectively as the Sixers slipped to 20 for 3, before Ella McCaughan took over. One over from
        Mannat Hundal swung the match: McCaughan hit her for a six and three fours in it, eighteen runs, and never
        let the required rate climb again. She finished unbeaten on 36 off 20 balls, and Indu Barma, the bowler who
        had removed Kapp an hour earlier, came in afterwards to help finish the job with 18 not out off 13.
      </p>
      <Super60WomenTopRunsChart
        data={[
          { player: "Marizanne Kapp", team: "Vancouver Warriors", runs: 104, note: "Three innings, out only once, 74* and 16 the key scores", highlight: true },
          { player: "Sophie Reid", team: "Vancouver Warriors", runs: 79 },
          { player: "Fatima Sana", team: "Vancouver Anchors", runs: 75, note: "Includes 49 off 31 in the 3rd Match" },
          { player: "Bess Heath", team: "Toronto Sixers", runs: 67 },
          { player: "Saachi Dhadwal", team: "Toronto Sixers", runs: 62 },
        ]}
      />
      <p>
        That gap, 104 at the top against 79 in second, is the size of Kapp&rsquo;s tournament. No one else in the
        competition passed 80 runs, and nobody else did it while being dismissed just once. Measured purely on the
        bat, the Super60 Women belonged to her from the first ball of the first match to the second-to-last ball of
        the last one.
      </p>
      <p>
        It just did not belong to her team. Toronto Sixers Women now have back-to-back Super60 Women titles, built
        on a bowling attack, led by Indu Barma, that found a way to stop the tournament&rsquo;s best batter exactly
        once, and an innings from Ella McCaughan that made sure it counted. For Kapp, a competition she dominated by
        every batting measure ends with a final defeat to add to a list that already runs through three WPL finals
        and a World Cup final. The runs keep coming. The trophy, for now, keeps going elsewhere.
      </p>
    </>
  ),
};
