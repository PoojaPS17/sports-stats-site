// Which kind of page a path is, for the funnel_click event: "from" and "to" use the same names, so
// GA4 can answer questions like "how many visitors go from the homepage to a match page".
export type PageKind =
  | "home"
  | "match"
  | "player"
  | "team"
  | "compare"
  | "series"
  | "league"
  | "standings"
  | "scores"
  | "article"
  | "search"
  | "top-games"
  | "other";

const OTHER_ROOTS = new Set(["f1", "tennis", "cricket", "asian-games", "beyond-the-scoreline", "search", "top-games", "privacy", "terms", "contact", "coming-soon", "api"]);

export function classifyPath(pathname: string): PageKind {
  const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  if (parts.length === 0) return "home";
  const [root, a, b, c] = parts;
  if (root === "search") return "search";
  if (root === "top-games") return "top-games";
  if (root === "beyond-the-scoreline") return a ? "article" : "other";
  if (root === "cricket") {
    if (a === "matches" && b) return "match";
    if (a === "series") return b ? "series" : "other";
    return "other";
  }
  if (root === "f1") {
    if (a === "events" && b) return "match";
    if (a === "drivers" && b) return "player";
    if (a === "teams" && b) return "team";
    if (a === "standings") return "standings";
    return "league";
  }
  if (root === "tennis") {
    if (a === "scores") return "scores";
    if (a === "tournaments" && b) return "match";
    if (a === "tournaments") return "other";
    if (b === "players" && c) return "player";
    if (b === "rankings") return "standings";
    return "league";
  }
  if (OTHER_ROOTS.has(root)) return "other";
  // /<league>/...
  if (!a) return "league";
  if (a === "games") return b ? "match" : "other";
  if (a === "players") return b ? "player" : "other";
  if (a === "teams") return b ? "team" : "other";
  if (a === "compare" || a === "h2h") return "compare";
  if (a === "standings") return "standings";
  if (a === "scores" || a === "matchweek") return "scores";
  return "other";
}

/** The path of a link's destination if it stays on this site, else null (external, mailto, same-page hash). */
export function internalPath(href: string, origin: string, current: string): string | null {
  try {
    const url = new URL(href, `${origin}${current}`);
    if (url.origin !== origin) return null;
    if (url.pathname === current.split("?")[0] && url.hash) return null;
    return url.pathname;
  } catch {
    return null;
  }
}
