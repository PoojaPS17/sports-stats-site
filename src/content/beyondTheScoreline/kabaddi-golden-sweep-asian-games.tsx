import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { KabaddiGoldTimelineChart } from "@/components/KabaddiGoldTimelineChart";

export const article: BeyondTheScorelineArticle = {
  slug: "kabaddi-golden-sweep-asian-games",
  title: "India's Men and Women Sweep Kabaddi Gold",
  dek: "Both Indian kabaddi teams beat Iran in Saturday's finals: a ninth men's gold, and revenge for the women's only final defeat.",
  publishedAt: "2026-09-27",
  readingMinutes: 3,
  tags: ["asian-games", "kabaddi", "india"],
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
  body: () => (
    <>
      <p>
        India&rsquo;s kabaddi teams beat Iran twice on Saturday, at the Tokai Citizen Gymnasium. The women held on
        for a 37-34 win. The men needed a second-half comeback for theirs, 40-34.
      </p>
      <p>
        The men&rsquo;s gold is India&rsquo;s ninth in the event since kabaddi joined the Asian Games program in
        1990. The only edition it has missed was 2018, when Iran beat India in the Jakarta final and ended a run of
        seven straight golds.
      </p>
      <p>
        The women&rsquo;s title carries the sharper storyline. Women&rsquo;s kabaddi arrived at the Asian Games in
        2010, and India won gold that year, in 2014, and again in 2022. Its one final defeat came in 2018, to Iran,
        the same team it just beat again. Saturday&rsquo;s scoreline mattered as much as the medal.
      </p>
      <KabaddiGoldTimelineChart
        data={[
          { edition: "1990", men: "gold", women: null },
          { edition: "1994", men: "gold", women: null },
          { edition: "1998", men: "gold", women: null },
          { edition: "2002", men: "gold", women: null },
          { edition: "2006", men: "gold", women: null },
          { edition: "2010", men: "gold", women: "gold" },
          { edition: "2014", men: "gold", women: "gold" },
          { edition: "2018", men: "runner-up", women: "runner-up" },
          { edition: "2022", men: "gold", women: "gold" },
          { edition: "2026", men: "gold", women: "gold" },
        ]}
      />
      <p>
        Kabaddi&rsquo;s medal events are done for these Games. India&rsquo;s wider contingent still has a week of
        competition left to add to the tally on the medal table.
      </p>
    </>
  ),
};
