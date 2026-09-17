import { isCricketLeague, LEAGUE_LABEL } from "@/lib/leagues";
import type { League } from "@/lib/leagues";
import { SubNav } from "./SubNav";

export function LeagueSubNav({ league }: { league: League }) {
  const cricket = isCricketLeague(league);
  const injuries = league === "nfl" || league === "nba";
  const tabs = [
    { label: "Scores", href: `/${league}`, exact: true },
    { label: "Standings", href: `/${league}/standings` },
    { label: "Teams", href: `/${league}/teams` },
    { label: "Leaders", href: `/${league}/leaders` },
    // Score-based analytics need plain integer scores, which cricket's innings totals
    // aren't; cricket gets the Centuries record list instead.
    ...(cricket
      ? [
          { label: "Centuries", href: `/${league}/centuries` },
          { label: "Compare", href: `/${league}/compare/players` },
        ]
      : [
          { label: "Power Rankings", href: `/${league}/power-rankings` },
          { label: "Records", href: `/${league}/records` },
          { label: "Compare", href: `/${league}/compare` },
        ]),
    ...(injuries ? [{ label: "Injuries", href: `/${league}/injuries` }] : []),
    { label: "News", href: `/${league}/news` },
  ];

  return <SubNav title={LEAGUE_LABEL[league]} titleHref={`/${league}`} tabs={tabs} />;
}
