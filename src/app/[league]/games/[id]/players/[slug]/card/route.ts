import { ImageResponse } from "next/og";
import { createElement } from "react";
import { isLeague, getGameByEspnId, getPlayerBySlug, getPlayerLog, getPlayerReportedGames, getPlayerEspnSeasons } from "@/lib/queries";
import { buildStagedProfile, playerSport } from "@/lib/playerProfile";
import { performanceLine } from "@/lib/performanceLine";
import { PerformanceCard } from "@/components/PerformanceCard";
import { CARD_FONTS } from "@/lib/cardFont";
import { gameRoundLabel } from "@/lib/stage";
import { formatGameDate } from "@/lib/gameDay";

export const revalidate = 300;

const SIZES: Record<string, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

// Phase 1 is NBA and NFL only (design doc, "Phases"): every other league returns 404, the
// same "route can only render pairs that exist" guarantee as the game/player/box-score checks.
const SUPPORTED_LEAGUES = new Set(["nba", "nfl"]);

function notFound() {
  return new Response("Not found", { status: 404 });
}

export async function GET(request: Request, { params }: { params: Promise<{ league: string; id: string; slug: string }> }) {
  const { league, id, slug } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "og";
  const size = SIZES[format];
  if (!size) return new Response("Bad format", { status: 400 });
  if (!isLeague(league) || !SUPPORTED_LEAGUES.has(league)) return notFound();
  // Set.has() doesn't narrow `league` from `League` down to "nba" | "nfl" for tsc — the same class of
  // gap as playerSport()'s null return below. PerformanceCard's `league` prop is typed "nba" | "nfl"
  // only, so this direct-equality check is required to satisfy the type checker; it is unreachable at
  // runtime (SUPPORTED_LEAGUES.has(league) above already guarantees it).
  if (league !== "nba" && league !== "nfl") return notFound();

  const [game, player] = await Promise.all([getGameByEspnId(league, id), getPlayerBySlug(league, slug)]);
  if (!game || !player) return notFound();

  const sport = playerSport(league);
  // SUPPORTED_LEAGUES already guarantees league is "nba" or "nfl" here, so sport is never null at
  // runtime — but Set.has() doesn't narrow the type, so this satisfies tsc (playerSport's real
  // signature returns PlayerSport | null for the full League union).
  if (!sport) return notFound();
  const [log, reportedGames, espnSeasons] = await Promise.all([getPlayerLog(league, player.espn_id), getPlayerReportedGames(league, player.espn_id), getPlayerEspnSeasons(league, player.espn_id)]);
  const row = log.find((r) => r.game_espn_id === id);
  // No stat line for this player in this game (a lineman, special-teams-only NFL player, or a
  // player who did not play): the route can only render pairs that exist. Design doc §3.
  if (!row) return notFound();

  const profile = buildStagedProfile(sport, log, reportedGames, espnSeasons).regular;
  const stats = performanceLine(sport, row, profile);

  const isHomeTeam = row.team_espn_id === game.home_team_espn_id;
  const teamColor = isHomeTeam ? game.home_color : game.away_color;

  const element = createElement(PerformanceCard, {
    league,
    playerName: player.name,
    position: player.position ?? null,
    jersey: player.jersey ?? null,
    teamAbbr: row.team_abbr,
    teamColor,
    opponentAbbr: row.opponent_abbr,
    // NBA/NFL games never end in a draw, so row.result is never actually "D" here — but its type
    // (GameResult, shared with soccer) is "W" | "D" | "L" | null while PerformanceCard only takes
    // "W" | "L" | null, so this narrows for tsc.
    resultLetter: row.result === "W" || row.result === "L" ? row.result : null,
    teamScore: row.team_score,
    opponentScore: row.opponent_score,
    date: formatGameDate(game.date, league, { month: "short", day: "numeric", year: "numeric" }),
    stageLabel: gameRoundLabel(game),
    stats,
  });

  const png = new ImageResponse(element, { ...size, fonts: CARD_FONTS });

  // ESPN corrects box scores shortly after a game — a game final for more than 2 hours is
  // treated as settled (day-long cache); anything newer gets a 5-minute cache. Design doc §6.
  const finalOver2Hours = game.completed && Date.now() - new Date(game.date).getTime() > 2 * 60 * 60 * 1000;
  const cacheControl = finalOver2Hours ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300";

  const headers = new Headers(png.headers);
  headers.set("cache-control", cacheControl);
  return new Response(png.body, { status: png.status, headers });
}
