/**
 * Whether a link should be prefetched. Cloudflare answers bots with a Managed Challenge on game, team,
 * player, h2h and compare pages, which turns every `?_rsc` prefetch of such a link into a 403 (a page can
 * carry dozens). Those links opt out with `prefetch={false}` and are fetched on click instead.
 *
 * `prefetchFor(href)` is for a link whose target is only known at run time: it is `false` for those page
 * families and `undefined` (Next's default) for everything else, so standings, league, series and
 * cricket-match links keep their prefetch.
 */
export const NO_PREFETCH_PATH = /\/(?:games|players|teams|h2h)\/|\/compare(?:[/?#]|$)/;

export function prefetchFor(href: string | null | undefined): false | undefined {
  return href && NO_PREFETCH_PATH.test(href) ? false : undefined;
}
