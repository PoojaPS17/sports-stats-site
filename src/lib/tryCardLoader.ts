// Database reads for the "Try a name" card and its server-side default. The card reads what the player's own page
// reads (getPlayerBySlug, getPlayerCricketCareer, getPlayerLog and the staged profile), so the figures agree.
import { unstable_cache } from "next/cache";
import { pool } from "./db";
import { isCricketLeague, isLeague, CRICKET_LEAGUES, SOCCER_LEAGUES, type League } from "./leagues";
import { getCricketRecentInnings, getPlayerBySlug, getPlayerCricketCareer, getPlayerEspnSeasons, getPlayerLog, getPlayerReportedGames } from "./queries";
import { notPseudoAthleteSql } from "./pseudoAthlete";
import { buildStagedProfile, hasGames, playerSport } from "./playerProfile";
import { CARD_BARS, cricketCard, profileCard, smallCard, type CricketSplitInnings, type TryCard } from "./tryCard";

const PER_INNINGS = `cross join lateral jsonb_array_elements(coalesce(pgs.stats->'innings', jsonb_build_array(pgs.stats))) as inn`;

/**
 * A cricketer's innings counted per side faced or per ground, from the same per-innings rows the career figures sum
 * (a Test's innings list, else the match). Dismissals are innings batted less not outs, as the career average counts them.
 */
export async function getCricketInningsSplits(league: League, playerEspnId: string, dimension: "opponent" | "venue"): Promise<CricketSplitInnings[]> {
  const key =
    dimension === "venue"
      ? { select: "g.venue", join: "", where: "and g.venue is not null", group: "g.venue" }
      : {
          select: "t.name",
          join: "join teams t on t.league = pgs.league and t.espn_id = (case when pgs.team_espn_id = g.home_team_espn_id then g.away_team_espn_id else g.home_team_espn_id end)",
          where: "",
          group: "t.espn_id, t.name",
        };
  const { rows } = await pool.query(
    `select ${key.select} as label,
            count(*) filter (where inn->'batting' is not null) as innings_batted,
            count(*) filter (where inn->'batting' is not null and not coalesce((inn->'batting'->>'notOut')::boolean, false)) as dismissals,
            coalesce(sum((inn->'batting'->>'runs')::int), 0) as runs,
            count(*) filter (where inn->'bowling' is not null) as innings_bowled,
            coalesce(sum((inn->'bowling'->>'wickets')::int), 0) as wickets,
            coalesce(sum((inn->'bowling'->>'conceded')::int), 0) as conceded
     from player_game_stats pgs
     join games g on g.league = pgs.league and g.espn_id = pgs.game_espn_id
     ${key.join}
     ${PER_INNINGS}
     where pgs.league = $1 and pgs.player_espn_id = $2 ${key.where}
     group by ${key.group}`,
    [league, playerEspnId]
  );
  return rows.map((r) => ({
    label: r.label as string,
    inningsBatted: Number(r.innings_batted),
    dismissals: Number(r.dismissals),
    runs: Number(r.runs),
    inningsBowled: Number(r.innings_bowled),
    wickets: Number(r.wickets),
    conceded: Number(r.conceded),
  }));
}

/** The card for one player page, or null when there is no such player. Never throws on a player without data: that is the small card. */
export async function loadTryCard(league: string, slug: string): Promise<TryCard | null> {
  if (!isLeague(league)) return null;
  const player = await getPlayerBySlug(league, slug);
  if (!player) return null;
  const identity = { league, slug: player.slug, name: player.name, team_name: player.team_name, team_color: player.team_color, position: player.position };

  if (isCricketLeague(league)) {
    const career = await getPlayerCricketCareer(league, player.espn_id);
    if (!career) return smallCard(identity);
    const [innings, opponents, venues] = await Promise.all([
      // A bowler who batted twice in eight matches still needs eight innings of bowling: read well past the bars and let the card filter.
      getCricketRecentInnings(league, player.espn_id, CARD_BARS * 4),
      getCricketInningsSplits(league, player.espn_id, "opponent"),
      getCricketInningsSplits(league, player.espn_id, "venue"),
    ]);
    return cricketCard(identity, career, innings, opponents, venues);
  }

  const sport = playerSport(league);
  if (!sport) return smallCard(identity);
  const [log, reported, espnSeasons] = await Promise.all([getPlayerLog(league, player.espn_id), getPlayerReportedGames(league, player.espn_id), getPlayerEspnSeasons(league, player.espn_id)]);
  const staged = buildStagedProfile(sport, log, reported, espnSeasons);
  if (!hasGames(staged)) return smallCard(identity, sport);
  return profileCard(identity, sport, staged.regular, staged.counted);
}

// ---------------------------------------------------------------------------
// The week's top performers: the server's default card and the "Try:" chips
// ---------------------------------------------------------------------------

export interface TryPick {
  league: string;
  slug: string;
  name: string;
}

/** Windows tried in order: a quiet week widens to a month, then to a year, rather than showing nothing. */
const WINDOWS_DAYS = [7, 30, 365];

interface Rule {
  leagues: readonly string[];
  /** SQL for the figure to rank by (an integer, from the player's stored line), with its joins. */
  figure: string;
  from: string;
  /** Extra sort keys after the figure, best first. */
  tiebreak?: string;
}

const CRICKET_BAT: Rule = {
  leagues: CRICKET_LEAGUES,
  figure: "(inn->'batting'->>'runs')::int",
  from: `${PER_INNINGS}`,
};
const CRICKET_BOWL: Rule = {
  leagues: CRICKET_LEAGUES,
  figure: "(inn->'bowling'->>'wickets')::int",
  from: `${PER_INNINGS}`,
  // Fewer runs conceded is the better five-for.
  tiebreak: "(inn->'bowling'->>'conceded')::int asc nulls last,",
};
const numeric = (path: string) => `case when ${path} ~ '^[0-9]+$' then (${path})::int end`;
const SOCCER_GOALS: Rule = { leagues: SOCCER_LEAGUES, figure: numeric("pgs.stats->'match'->>'G'"), from: "" };
const NBA_POINTS: Rule = { leagues: ["nba"], figure: numeric("pgs.stats->'box'->>'PTS'"), from: "" };
const NFL_PASSING: Rule = { leagues: ["nfl"], figure: numeric("pgs.stats->'passing'->>'YDS'"), from: "" };

/**
 * The single best individual line by `rule` among games that finished in the last `days`, or null when there is none.
 * Deterministic: the highest figure, then the later game, then the player's slug, so two renders of the same data pick the same person.
 */
export async function topPerformer(rule: Rule, days: number): Promise<TryPick | null> {
  const { rows } = await pool.query(
    `select pgs.league, p.slug, p.name
     from games g
     join player_game_stats pgs on pgs.league = g.league and pgs.game_espn_id = g.espn_id
     join players p on p.league = pgs.league and p.espn_id = pgs.player_espn_id
     ${rule.from}
     where g.league = any($1::text[]) and g.completed and g.date <= now() and g.date >= now() - make_interval(days => $2)
       and ${rule.figure} > 0 and ${notPseudoAthleteSql()}
     order by ${rule.figure} desc, ${rule.tiebreak ?? ""} g.date desc, p.slug asc
     limit 1`,
    [rule.leagues, days]
  );
  return rows[0] ? { league: rows[0].league, slug: rows[0].slug, name: rows[0].name } : null;
}

async function widening(rule: Rule): Promise<TryPick | null> {
  for (const days of WINDOWS_DAYS) {
    const pick = await topPerformer(rule, days);
    if (pick) return pick;
  }
  return null;
}

export interface TrySuggestions {
  /** The default card: the highest individual cricket score of the week. */
  featured: TryPick | null;
  /** The chips, featured first, one per person. */
  chips: TryPick[];
}

export async function readTrySuggestions(): Promise<TrySuggestions> {
  const picks = await Promise.all([widening(CRICKET_BAT), widening(CRICKET_BOWL), widening(SOCCER_GOALS), widening(NBA_POINTS), widening(NFL_PASSING)]);
  const chips: TryPick[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    if (!pick) continue;
    // A person is one chip even when he is the week's top scorer and top bowler, or has a page in two formats.
    const key = `${pick.league}/${pick.slug}`;
    if (seen.has(key) || chips.some((c) => c.name === pick.name)) continue;
    seen.add(key);
    chips.push(pick);
  }
  return { featured: picks[0] ?? chips[0] ?? null, chips };
}

const cachedSuggestions = unstable_cache(readTrySuggestions, ["try-suggestions"], { revalidate: 900 });
const cachedCard = unstable_cache(loadTryCard, ["try-card"], { revalidate: 900 });

/** For the home page: null on any failure, so the section degrades to the search box alone instead of failing the page. */
export async function getTryDefaults(): Promise<{ suggestions: TrySuggestions; card: TryCard | null } | null> {
  try {
    const suggestions = await cachedSuggestions();
    const card = suggestions.featured ? await cachedCard(suggestions.featured.league, suggestions.featured.slug) : null;
    return { suggestions, card };
  } catch (err) {
    console.error("try a name defaults", err);
    return null;
  }
}
