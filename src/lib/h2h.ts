// URL helper shared by the pages that link to head-to-head history. One canonical
// URL per pairing (alphabetical), so the same matchup never exists at two addresses.
export function h2hPath(league: string, slugA: string, slugB: string): string {
  const [a, b] = [slugA, slugB].sort();
  return `/${league}/h2h/${a}-vs-${b}`;
}
