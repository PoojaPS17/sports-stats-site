import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";
import { isLeague, isCricketLeague, LEAGUE_LABEL, getGameByEspnId, getGameDetails } from "@/lib/queries";
import { gameCalledOffLabel } from "@/lib/gameStatus";
import { finishedNoScoreNote, shareImageModel, sideScoreText, splitScoreText } from "@/lib/gameDisplay";
import { formatGameDate } from "@/lib/gameDay";
import { resolveTeamLogo } from "@/lib/teamLogos";
import { verifyLogoUrl } from "@/lib/verifyImageUrl";

export const alt = "Match page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

// Dynamic on purpose: no generateStaticParams here, so the score on the share image is read fresh each time.
// It renders on every request and answers no-store: a cached render is up to 5 minutes old
// (expireTime in next.config.ts), which would show a stale score on the share image. The window
// above still sets the default for the cached fetches inside this render.

// A cricket score is a big figure ("235/6", or "233" for a bowled-out side) over a small line for the rest
// ("44.1/50 ov, target 234", "all out"): the whole string at this size wrapped past the card's edge.
function Side({ name, logo, score, muted }: { name: string; logo: string | null; score: string | null; muted: boolean }) {
  const parts = score !== null ? splitScoreText(score) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: 380 }}>
      {logo ? (
        <img src={logo} width={170} height={170} alt="" style={{ objectFit: "contain" }} />
      ) : (
        <div style={{ width: 170, height: 170, borderRadius: 85, background: "#1b2640" }} />
      )}
      <div style={{ fontSize: 34, fontWeight: 700, textAlign: "center", color: muted ? "#9aa5bd" : "#eef1f7" }}>{name}</div>
      {parts && <div style={{ fontSize: 96, fontWeight: 800, lineHeight: 1, color: muted ? "#9aa5bd" : "#eef1f7" }}>{parts.main}</div>}
      {parts?.detail && <div style={{ fontSize: 28, fontWeight: 600, color: "#9aa5bd" }}>{parts.detail}</div>}
    </div>
  );
}

// Share image for a match: both crests, the score when played, kickoff date otherwise.
export default async function Image({ params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  const game = isLeague(league) ? await getGameByEspnId(league, id) : null;
  if (!game) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#0b1324", color: "#eef1f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>SportsDB</div>, size);
  }
  const off = gameCalledOffLabel(game);
  const played = !off && game.completed && game.home_score != null && game.away_score != null;
  const homeWon = played && (game.home_winner ?? game.home_score! > game.away_score!);
  const awayWon = played && (game.away_winner ?? game.away_score! > game.home_score!);
  // A finished match with no scores (abandoned, no result) says how it ended instead of a bare date and "vs".
  const note = off ? null : finishedNoScoreNote(game);
  // Cricinfo lists the side that batted first first: the stored scorecard says which, the score lines are the
  // fallback. Football lists the home side first; the NBA and NFL list the visitors first. shareImageModel
  // decides both the status word and that order, so the route holds no display rule of its own.
  const scorecard = isCricketLeague(game.league) && game.completed ? ((await getGameDetails(game.league, id))?.scorecard ?? null) : null;
  const { status, order } = shareImageModel(game, scorecard);
  const when = formatGameDate(game.date, league, { weekday: "short", month: "short", day: "numeric", year: "numeric" }, game.local_date);
  // A stored logo_url can be a dead path (many cricket sides have none, but any league's could
  // rot) that only gets corrected here, not in the database, so this route re-checks it instead
  // of trusting the row: @vercel/og fetches <img src> server-side and throws rendering the page
  // if it 404s, unlike TeamLogo's client-side <img onError> which just falls back to the
  // initials disc. resolveTeamLogo applies cricket's curated substitutes first; verifyLogoUrl is
  // the general safety net that catches anything still dead, cricket or not.
  const cricket = isCricketLeague(game.league);
  const [homeLogo, awayLogo] = await Promise.all([
    verifyLogoUrl(cricket ? resolveTeamLogo(game.home_team_espn_id, game.home_logo) : game.home_logo),
    verifyLogoUrl(cricket ? resolveTeamLogo(game.away_team_espn_id, game.away_logo) : game.away_logo),
  ]);

  const sides = {
    away: <Side name={game.away_name} logo={awayLogo} score={played ? sideScoreText(game.league, game.away_score, game.away_score_display, true) ?? String(game.away_score) : null} muted={played && !awayWon} />,
    home: <Side name={game.home_name} logo={homeLogo} score={played ? sideScoreText(game.league, game.home_score, game.home_score_display, true) ?? String(game.home_score) : null} muted={played && !homeWon} />,
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 56,
          background: "linear-gradient(135deg, #0b1324 0%, #121c33 100%)",
          color: "#eef1f7",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 3 }}>
          <span>{isLeague(league) ? LEAGUE_LABEL[league] : ""}</span>
          <span>{status ? `${status} · ${when}` : when}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {sides[order[0]]}
          <div style={{ display: "flex", justifyContent: "center", textAlign: "center", ...(note ? { width: 280, fontSize: 28, color: "#9aa5bd" } : { fontSize: 40, color: "#6b7890" }), fontWeight: 700 }}>{played ? "" : (note ?? "vs")}</div>
          {sides[order[1]]}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: "#c6f135", fontWeight: 700 }}>
          <PixelBall size={28} fill="#ffffff" live="#c6f135" />
          SportsDB
        </div>
      </div>
    ),
    size
  );
}
