import type { BeyondTheScorelineArticle } from "@/lib/beyondTheScoreline";
import { BrewersDodgersNlcsChart } from "@/components/BrewersDodgersNlcsChart";
import { MisiorowskiOctoberChart } from "@/components/MisiorowskiOctoberChart";

export const article: BeyondTheScorelineArticle = {
  slug: "brewers-2-0-nlcs-lead-by-the-numbers",
  title: "Brewers' 2-0 NLCS Lead, by the Numbers",
  dek: "Milwaukee has won both NLCS games at American Family Field by a combined 9-5, with its bullpen carrying a shaky Jacob Misiorowski and its lineup delivering the late hits a star-studded Dodgers team has not.",
  publishedAt: "2026-10-14",
  readingMinutes: 5,
  tags: ["mlb", "brewers", "dodgers"],
  art: { number: "2-0", caption: "NLCS lead over the two-time defending champion Dodgers after two bullpen gems" },
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
      label: "MLB scores, October 11",
      href: "/mlb/scores/2026-10-11",
      description: "NLCS Game 1: Brewers 2, Dodgers 1",
    },
    {
      label: "MLB scores, October 12",
      href: "/mlb/scores/2026-10-12",
      description: "NLCS Game 2: Brewers 7, Dodgers 4",
    },
  ],
  body: () => (
    <>
      <p>
        Jacob Misiorowski walked Shohei Ohtani on four pitches, then walked Kyle Tucker on ten, and the Dodgers had
        the kind of chance that is supposed to turn an NLCS game. Andy Pages singled home the only run Los Angeles
        would get. Milwaukee&rsquo;s bullpen did the rest, and the Brewers have won both games of the series at
        American Family Field, 2-1 and 7-4, without needing their best player to pitch like himself.
      </p>
      <BrewersDodgersNlcsChart
        data={[
          { game: "Game 1", brewersRuns: 2, dodgersRuns: 1 },
          { game: "Game 2", brewersRuns: 7, dodgersRuns: 4 },
        ]}
      />
      <p>
        Misiorowski led all of baseball with a 1.80 ERA this season, going 16-5 with a 0.80 WHIP and 252
        strikeouts over 174.2 innings across 30 starts, numbers that made him the favorite in a Game 1
        showdown with Dodgers starter Tarik Skubal. October has been a grind instead. He lasted four innings in
        his NLDS Game 1 start against San Diego, chased after allowing two earned runs, and in NLCS Game 1 he threw
        94 pitches, only 60 of them strikes, and was done after 4.1 innings having walked three and allowed
        five hits. Milwaukee&rsquo;s relievers, DL Hall, Abner Uribe, Aaron Ashby and Trevor Megill, combined to get
        the final 14 outs and protect a one-run lead built on a Brice Turang solo homer and a go-ahead single from
        Luis Lara.
      </p>
      <p>
        Game 2 followed a similar shape with a different hero. William Contreras tied the score with a 436-foot
        solo homer off Dodgers reliever Kris Bubic in the fifth inning, then drove in the go-ahead run with a
        single the next inning. Turang and Jake Bauers added RBI singles in the eighth for insurance, and four
        Brewers relievers retired the final 15 Dodgers batters in order to close it out. Los Angeles managed four
        runs in a game it trailed for most of the way, the same story as Game 1: enough chances to win, not enough
        hits when it mattered.
      </p>
      <MisiorowskiOctoberChart
        data={[
          { value: "1.80", label: "Misiorowski's 2026 ERA", note: "Led all of MLB over 30 regular-season starts" },
          { value: "4.0 IP", label: "NLDS Game 1 vs. San Diego", note: "Chased after allowing 2 earned runs" },
          { value: "4.1 IP", label: "NLCS Game 1 vs. L.A.", note: "94 pitches, 3 walks, 1 earned run allowed" },
        ]}
      />
      <p>
        The gap between the two rosters makes the scoreline more striking. The Dodgers hit 204 home runs this
        season, tied for seventh-most in the majors, and still field the lineup that includes Ohtani and Tucker.
        Milwaukee finished 103-59, a franchise record and the best mark in baseball, three games clear of the
        Dodgers&rsquo; own 100-62, but it has been the Brewers&rsquo; bullpen and complementary bats, not a power
        show, that have decided both wins. Los Angeles is chasing a third straight World Series title, a feat only
        the 1998-2000 Yankees have managed since the sport went to divisional play, and its two best hitters have
        combined for one hit with runners in scoring position through two games.
      </p>
      <p>
        The series shifts to Dodger Stadium for Game 3 on Wednesday night, where losing a third straight game at
        home would put Los Angeles on the brink of missing a fourth straight World Series appearance. Milwaukee has
        not won a pennant since 1982, when it lost the World Series in seven games to St. Louis, and has not had a
        2-0 lead with this much support behind it: two wins away from erasing a 44-year wait, against the only
        team that has stood between it and a trip back.
      </p>
    </>
  ),
};
