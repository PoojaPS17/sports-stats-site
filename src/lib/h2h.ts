// URL helper shared by the pages that link to head-to-head history. One canonical
// URL per pairing (alphabetical), so the same matchup never exists at two addresses.
export function h2hPath(league: string, slugA: string, slugB: string): string {
  const [a, b] = [slugA, slugB].sort();
  return `/${league}/h2h/${a}-vs-${b}`;
}

/**
 * Meta description of a pair page. With no counted meeting there is no record to quote ("0-0-0 in 0 meetings"),
 * and the page itself renders noindex, so the description says there is no completed regular-season or playoff
 * meeting. It does not say the two teams never met: a pair whose only game is a preseason or All-Star one has
 * that game listed on the page.
 */
export function h2hDescription(teamA: string, teamB: string, leagueLabel: string, meetings: number, record: string): string {
  if (meetings === 0) return `${teamA} vs ${teamB} in the ${leagueLabel}: no completed regular-season or playoff meetings in our archive yet.`;
  return `${teamA} vs ${teamB} all-time ${leagueLabel} record (${record} in ${meetings} meetings), recent results and biggest wins.`;
}
