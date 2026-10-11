import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { RaysAldsSweepChart } from "@/components/RaysAldsSweepChart";
import { RaysPennantRunsChart } from "@/components/RaysPennantRunsChart";

export const article: BeyondTheScorelineArticle = {
  slug: "rays-sweep-yankees-alds-first-ever",
  title: "The Numbers Behind the Rays' First-Ever ALDS Sweep",
  dek: "Tampa Bay allowed five runs across three games, capped by Drew Rasmussen's 10-strikeout one-hitter, to sweep the Yankees out of the ALDS for the first time in team history.",
  publishedAt: "2026-10-11",
  readingMinutes: 5,
  tags: ["mlb", "rays", "yankees"],
  art: { number: "5", caption: "runs the Rays allowed across three games in the first ALDS sweep in team history" },
  relatedLinks: [
    {
      label: "MLB standings",
      href: "/mlb/standings",
      description: "2026 regular season and postseason picture",
    },
    {
      label: "MLB records",
      href: "/mlb/records",
      description: "Season and franchise marks across the league",
    },
    {
      label: "MLB leaders",
      href: "/mlb/leaders",
      description: "Pitching and batting leaders across the league",
    },
    {
      label: "MLB teams",
      href: "/mlb/teams",
      description: "Every club in Major League Baseball",
    },
  ],
  body: () => (
    <>
      <p>
        Victor Mesa Jr. hit a two-run homer off Max Fried in the sixth inning at Yankee Stadium on Wednesday, and
        after a video review stripped the Yankees of a fan-interference call that would have turned it into an RBI
        double for Anthony Volpe instead, the swing stood. Tampa Bay held on to win 4-3, and with it closed out a
        three-game sweep of the American League Division Series. It is the first time in the Rays&rsquo; 29-season
        history that they have swept a Division Series.
      </p>
      <RaysAldsSweepChart
        data={[
          { value: "3-0", label: "Final series result", note: "Tampa Bay never trailed in a winnable game all series" },
          { value: "5", label: "Total runs allowed", note: "Across three games: 0, 2 and 3 runs allowed" },
          { value: "10", label: "Rasmussen's Game 1 strikeouts", note: "Tied Tyler Glasnow's franchise postseason record" },
          { value: "1", label: "Hit allowed in Game 1", note: "An Austin Wells single with two outs in the 8th" },
        ]}
      />
      <p>
        The series opened about as lopsided as a 1-0 game can look. Drew Rasmussen held New York hitless until Wells
        poked a ball just inside the right-field line with two outs in the eighth, finishing with one hit, two walks
        and ten strikeouts over eight scoreless innings. Jonathan Aranda&rsquo;s solo homer off Gerrit Cole was the
        only run Tampa Bay needed. Rasmussen&rsquo;s ten strikeouts tied Glasnow&rsquo;s mark for the most in a single
        postseason start in franchise history, set in a different October a few years earlier. Two days later, at
        Tropicana Field, the Rays won again, 5-2, pushing the Yankees to the brink without having trailed in either
        game.
      </p>
      <p>
        New York arrived at this series already shorthanded. Aaron Judge sat out the Wild Card round and the ALDS
        with a calf strain, and the Yankees needed a two-game sweep of their own, over Boston, just to get there, a
        9-2 Game 2 win built on Cody Bellinger and Max Fried. None of that carried into the Rays series. Tampa Bay
        outscored New York 10-5 across the three games and had a lead at some point in every one of them, turning
        the tables on the one other time these two clubs met in October: the 2020 ALDS, which the Rays won only
        after trailing 0-1.
      </p>
      <p>
        That 2020 series is the one that matters most here, because the comeback that defined it, Tampa Bay rallying
        from an 0-1 deficit to win in five games, is part of why this sweep stands out. The Rays have been to the
        ALCS exactly twice before: in 2008, their first winning season as a franchise, when they beat Boston in a
        seven-game ALCS before losing the World Series to Philadelphia in five, and in 2020, when they beat Houston in
        seven to reach a World Series they lost to the Dodgers in six. Both pennants came the hard way, through a
        Championship Series that went the distance. Getting back to the ALCS without dropping a single Division
        Series game is new ground for a team that has made a habit of winning its series in the final inning rather
        than the final out of Game 3.
      </p>
      <RaysPennantRunsChart
        data={[
          {
            year: "2008",
            headline: "First pennant",
            note: "Beat the Red Sox in a 7-game ALCS, then lost the World Series to the Phillies in 5",
          },
          {
            year: "2020",
            headline: "Second pennant",
            note: "Beat the Astros in a 7-game ALCS, then lost the World Series to the Dodgers in 6",
          },
          {
            year: "2026",
            headline: "Third pennant bid",
            note: "Swept the Yankees 3-0 in the ALDS, the first sweep in team history, to reach the ALCS",
            highlight: true,
          },
        ]}
      />
      <p>
        What the sweep buys Tampa Bay, beyond rest, is a pitching staff that did not have to be stretched into a
        Game 4 or 5 the way both of its pennant runs eventually required. Rasmussen&rsquo;s Game 1 line is the kind of
        start a team usually needs just to survive a series like this one; instead it set the tone for a sweep. The
        Rays now wait on the winner of the other AL Division Series to open the ALCS at Tropicana Field. Whoever it
        is will be facing a team that has not had to use its bullpen in a close elimination game all October, and a
        rotation that gave the Yankees nothing to show for their own trip to the postseason but an early flight
        home.
      </p>
    </>
  ),
};
