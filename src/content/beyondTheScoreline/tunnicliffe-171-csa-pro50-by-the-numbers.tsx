import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { TunnicliffeCSAPro50Chart } from "@/components/TunnicliffeCSAPro50Chart";
import { CSAPro50TopScoresChart } from "@/components/CSAPro50TopScoresChart";

export const article: BeyondTheScorelineArticle = {
  slug: "tunnicliffe-171-csa-pro50-by-the-numbers",
  title: "Tunnicliffe's 171: The Pro50 by the Numbers",
  dek: "Faye Tunnicliffe's 171 off 131 balls, the highest score of the CSA Women's Pro50's opening weekend, anchored a 210-run stand with Nadine de Klerk and powered Western Province past Garden Route Badgers by 65 runs.",
  publishedAt: "2026-10-08",
  readingMinutes: 5,
  tags: ["cricket", "csa-womens-pro50", "western-province"],
  art: { number: "171", caption: "runs for Western Province, the top score of the Pro50's opening weekend" },
  relatedLinks: [
    {
      label: "CSA Women's Pro50 2026/27",
      href: "/cricket/series/1554058",
      description: "Points table, results and series stats",
    },
    {
      label: "Western Province vs South Western Districts, 1st Match",
      href: "/cricket/matches/1554089",
      description: "Full scorecard from Newlands, Cape Town",
    },
    {
      label: "Titans vs Dolphins, 3rd Match",
      href: "/cricket/matches/1554091",
      description: "Wolvaardt's 123 not out in the same round",
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
        Faye Tunnicliffe faced 131 balls at Newlands on October 3 and hit 19 fours and five sixes before she was
        finally out for 171. It was the highest score of the CSA Women&rsquo;s Pro50&rsquo;s opening weekend, and it
        put Western Province&rsquo;s innings against Garden Route Badgers out of reach before the Badgers had even
        picked up a bat.
      </p>
      <TunnicliffeCSAPro50Chart
        data={[
          { value: "171", label: "Tunnicliffe's score, off 131 balls", note: "19 fours and five sixes, the Pro50's top score of the round" },
          { value: "210", label: "Partnership with Nadine de Klerk", note: "De Klerk made 101 off 108 balls in the same stand" },
          { value: "349/4", label: "Western Province's total", note: "The highest team score of the opening round" },
          { value: "65 runs", label: "Margin of victory", note: "Garden Route Badgers were restricted to 284/9 chasing 350" },
        ]}
      />
      <p>
        Tunnicliffe is not a surprise name at the top of a scorecard. Last season she became the first woman to pass
        400 runs in a single CSA Women&rsquo;s domestic season, breaking the previous mark of 386 set by her own
        Proteas teammate Tazmin Brits, and the form earned her a recall to the South Africa squad, where she struck
        her maiden T20I half-century against Ireland. The 171 at Newlands is the same player picking up almost
        exactly where last season left off, in the first round of a new one.
      </p>
      <p>
        She did not do it alone. De Klerk&rsquo;s 101 was her own hundred inside the same 210-run stand, and together
        they meant Western Province never had to bat with any urgency after being put in. Nosipho Vezi then took 3
        for 65 and Sinelethu Yaso 2 for 43 as the Badgers, chasing 350, were bowled out for 284 to hand the Cobras a
        65-run win to open their season.
      </p>
      <p>
        It was not the only big score of the round. At Centurion, Titans&rsquo; Laura Wolvaardt, South Africa&rsquo;s
        captain across all three formats, made 123 not out to anchor a total of 228 for 8, and Paulinah Mashishi then
        took 4 for 35 as Dolphins were bowled out for 142, an 86-run win. Elsewhere, Eastern Province and Lions saw
        their match abandoned without a ball bowled. Between the two results that did finish, the round produced two
        of the three biggest individual innings in the competition&rsquo;s short history so far, on the same day.
      </p>
      <CSAPro50TopScoresChart
        data={[
          { player: "Faye Tunnicliffe", team: "Western Province", runs: 171, note: "1st Match vs Garden Route Badgers", highlight: true },
          { player: "Laura Wolvaardt", team: "Titans", runs: 123, note: "not out, 3rd Match vs Dolphins" },
          { player: "Nadine de Klerk", team: "Western Province", runs: 101, note: "1st Match vs Garden Route Badgers" },
          { player: "Babette de Lede", team: "South Western Districts", runs: 62, note: "1st Match vs Western Province" },
          { player: "N. Janse van Rensburg", team: "South Western Districts", runs: 54, note: "not out, 1st Match vs Western Province" },
        ]}
      />
      <p>
        That gap between 171 at the top of the list and 62 in fourth is the shape of the whole opening round: two
        sides, Western Province and Titans, batted their rivals out of the contest early, while the other four teams
        are still looking for their first points. It left Titans top of the early table on net run rate after their
        bigger winning margin, with Western Province second, Eastern Province and Lions on two points apiece from a
        no-result, and South Western Districts and Dolphins still searching for a win.
      </p>
      <p>
        One round in, the question is whether Tunnicliffe and Western Province can turn an opening statement into
        the kind of season she had in 2025-26, when the Cobras completed a Pro20-and-Pro50 double. A 171 at Newlands
        is as strong a start to that defence as the competition could have handed them.
      </p>
    </>
  ),
};
