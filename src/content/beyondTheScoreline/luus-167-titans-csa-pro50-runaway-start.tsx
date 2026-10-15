import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { LuusTitansPro50Chart } from "@/components/LuusTitansPro50Chart";
import { CSAPro50RunLeadersChart } from "@/components/CSAPro50RunLeadersChart";

export const article: BeyondTheScorelineArticle = {
  slug: "luus-167-titans-csa-pro50-runaway-start",
  title: "Luus's 167 and Titans' 2-0 Start, by the Numbers",
  dek: "Sune Luus's unbeaten 167 off 131 balls, backed by a 5 for 19 from Caitlin Wyngaard, gave Titans Women a 211-run win over Lions Women and a 2-0 start to the CSA Women's Pro50, with Luus now the competition's leading run-scorer.",
  publishedAt: "2026-10-15",
  readingMinutes: 5,
  tags: ["cricket", "csa-womens-pro50", "titans-women"],
  art: { number: "167*", caption: "Sune Luus's unbeaten score in a 211-run win that put Titans 2-0" },
  relatedLinks: [
    {
      label: "CSA Women's Pro50 2026/27",
      href: "/cricket/series/1554058",
      description: "Points table, results and series stats",
    },
    {
      label: "Titans Women vs Lions Women, 4th Match",
      href: "/cricket/matches/1554092",
      description: "Full scorecard from SuperSport Park, Centurion",
    },
    {
      label: "Titans Women vs Dolphins Women, 3rd Match",
      href: "/cricket/matches/1554091",
      description: "Wolvaardt's 123 not out in Titans' first win",
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
        Sune Luus faced 131 balls at SuperSport Park in Centurion on October 10 and finished unbeaten on 167, the
        second-highest innings of the CSA Women&rsquo;s Pro50 season so far. It came in Titans Women&rsquo;s 4th
        Match of the competition, against Lions Women, and it left them with nowhere to go: Titans posted 330 for 3
        off their 50 overs, and Lions were bowled out for 119, a 211-run defeat.
      </p>
      <LuusTitansPro50Chart
        data={[
          { value: "167*", label: "Luus's unbeaten score, off 131 balls", note: "21 fours and 4 sixes, the Pro50 season's second-highest innings" },
          { value: "211 runs", label: "Margin of victory over Lions Women", note: "The competition's heaviest defeat so far" },
          { value: "5/19", label: "Caitlin Wyngaard's figures", note: "Her best bowling return since joining Titans from Western Province" },
          { value: "2-0", label: "Titans' start to the season", note: "Net run rate of +2.97, best of any side in the table" },
        ]}
      />
      <p>
        Luus did not do it entirely on her own. Laura Wolvaardt added 57 off 58 balls in the same innings, and
        Anneke Bosch an unbeaten 27 down the order, but it was Luus who batted the full 50 overs and finished
        with 21 fours and four sixes. She has spent most of 2026 adjusting to a new role for South Africa, handing
        the T20I captaincy back to Wolvaardt in April after three years in charge and moving up the order to open
        alongside her instead. An unbeaten 167 for her franchise is as strong a sign as any that the change of job
        has not cost her any runs.
      </p>
      <p>
        Caitlin Wyngaard&rsquo;s 5 for 19 did the rest. The 21-year-old right-arm seamer only moved to the Titans
        from Western Province ahead of this season and earned her first senior Proteas call-up, for a T20I series
        in Zimbabwe, as recently as September. Her five wickets, backed by two more from Paulinah Mashishi, tore
        through a Lions batting order that never found a partnership: Razeena Manack&rsquo;s 34 was the highest
        score of the innings, and nobody else passed 23.
      </p>
      <p>
        It is Titans&rsquo; second lopsided win in as many matches. Their opening fixture, against Dolphins Women,
        was closer on paper but no less one-sided in practice: Wolvaardt made 123 not out to set up a total of 228
        for 8, and Mashishi took 4 for 35 as Dolphins were bowled out for 142, an 86-run defeat. Put the two results
        together and Titans have outscored their opponents by 297 runs across two matches, with defending champions
        Western Province, who completed the Pro20-and-Pro50 double last season, still to play their second game.
      </p>
      <CSAPro50RunLeadersChart
        data={[
          { player: "Sune Luus", team: "Titans", runs: 197, note: "2 innings, strike rate 103.68, high score 167*", highlight: true },
          { player: "Laura Wolvaardt", team: "Titans", runs: 180, note: "2 innings, high score 123*" },
          { player: "Faye Tunnicliffe", team: "Western Province", runs: 171, note: "1 innings, opening weekend's top score" },
          { player: "Nadine de Klerk", team: "Western Province", runs: 101, note: "1 innings" },
          { player: "Babette de Lede", team: "South Western Districts", runs: 62, note: "1 innings" },
        ]}
      />
      <p>
        That leaderboard is the clearest measure of how far ahead of the field Titans have moved. Luus&rsquo;s 197
        runs from two innings have already passed Faye Tunnicliffe&rsquo;s tournament-topping 171, the single
        biggest innings of the opening weekend, and Wolvaardt sits right behind her on 180. Two Titans players now
        occupy the top two spots on the run charts, and Mashishi leads the wicket-takers with 6, ahead of
        Wyngaard&rsquo;s 5. No other side has a player near the top of either list.
      </p>
      <p>
        Two more rounds follow before the league phase breaks for a fortnight, on October 17 and October 24, with
        Titans not back in action until they host Western Province on the later date. For now, the table says what
        the scorecards already suggested: two matches in, Titans are the only unbeaten side with a win to show for
        it, and Luus&rsquo;s 167 not out is the biggest reason why.
      </p>
    </>
  ),
};
