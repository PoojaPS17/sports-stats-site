import { isCricketLeague, LEAGUE_LABEL } from "@/lib/leagues";
import type { League } from "@/lib/leagues";
import { SubNav } from "./SubNav";

export function LeagueSubNav({ league }: { league: League }) {
  const tabs = [
    { label: "Scores", href: `/${league}`, exact: true },
    { label: "Standings", href: `/${league}/standings` },
    { label: "Teams", href: `/${league}/teams` },
    { label: "Leaders", href: `/${league}/leaders` },
    { label: "News", href: `/${league}/news` },
    // Only a meaningful concept for cricket — other sports don't have a
    // single-innings scoring feat that warrants its own record list.
    ...(isCricketLeague(league) ? [{ label: "Centuries", href: `/${league}/centuries` }] : []),
  ];

  return <SubNav title={LEAGUE_LABEL[league]} titleHref={`/${league}`} tabs={tabs} />;
}
