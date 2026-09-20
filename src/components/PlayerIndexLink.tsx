import Link from "next/link";

/**
 * One line of the players index: the player's name, their team under it, one link to the player page.
 *
 * The largest leagues list thousands of players (ucl: 8,942), and Google reads only the first 2 MB of a
 * page, so a row is as small as it can be while showing the same things: no avatar, no wrappers, and no
 * class attribute - the look comes from `.player-grid > a` in globals.css. The link is not prefetched, so
 * thousands of links do not each start a request. `team` is the team's display name.
 */
export function PlayerIndexLink({ league, name, slug, team }: { league: string; name: string; slug: string; team: string | null }) {
  return (
    <Link href={`/${league}/players/${slug}`} prefetch={false}>
      {name}
      {team && <span>{team}</span>}
    </Link>
  );
}
