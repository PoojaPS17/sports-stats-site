import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";
import { isLeague, LEAGUE_LABEL, getGameByEspnId } from "@/lib/queries";
import { gameCalledOffLabel } from "@/lib/gameStatus";
import { finishedNoScoreNote } from "@/lib/gameDisplay";

export const alt = "Match page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

function Side({ name, logo, score, muted }: { name: string; logo: string | null; score: string | null; muted: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: 380 }}>
      {logo ? (
        <img src={logo} width={170} height={170} alt="" style={{ objectFit: "contain" }} />
      ) : (
        <div style={{ width: 170, height: 170, borderRadius: 85, background: "#233047" }} />
      )}
      <div style={{ fontSize: 34, fontWeight: 700, textAlign: "center", color: muted ? "#9aa7bd" : "#e8edf6" }}>{name}</div>
      {score !== null && <div style={{ fontSize: 96, fontWeight: 800, color: muted ? "#9aa7bd" : "#e8edf6" }}>{score}</div>}
    </div>
  );
}

// Share image for a match: both crests, the score when played, kickoff date otherwise.
export default async function Image({ params }: { params: Promise<{ league: string; id: string }> }) {
  const { league, id } = await params;
  const game = isLeague(league) ? await getGameByEspnId(league, id) : null;
  if (!game) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#0b1220", color: "#e8edf6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>SportsDB</div>, size);
  }
  const played = game.completed && game.home_score != null && game.away_score != null;
  const homeWon = played && (game.home_winner ?? game.home_score! > game.away_score!);
  const awayWon = played && (game.away_winner ?? game.away_score! > game.home_score!);
  const off = gameCalledOffLabel(game);
  // A finished match with no scores (abandoned, no result) says how it ended instead of a bare date and "vs".
  const note = finishedNoScoreNote(game);
  const when = new Date(game.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

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
          background: "linear-gradient(135deg, #0b1220 0%, #16223a 100%)",
          color: "#e8edf6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#9aa7bd", textTransform: "uppercase", letterSpacing: 3 }}>
          <span>{isLeague(league) ? LEAGUE_LABEL[league] : ""}</span>
          <span>{played || note ? `Final · ${when}` : off ? `${off} · ${when}` : when}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Side name={game.away_name} logo={game.away_logo} score={played ? String(game.away_score_display ?? game.away_score) : null} muted={played && !awayWon} />
          <div style={{ display: "flex", justifyContent: "center", textAlign: "center", ...(note ? { width: 280, fontSize: 28, color: "#9aa7bd" } : { fontSize: 40, color: "#6b788f" }), fontWeight: 700 }}>{played ? "" : (note ?? "vs")}</div>
          <Side name={game.home_name} logo={game.home_logo} score={played ? String(game.home_score_display ?? game.home_score) : null} muted={played && !homeWon} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: "#6ea0ff", fontWeight: 700 }}>
          <PixelBall size={28} fill="#6ea0ff" live="#f87171" />
          SportsDB
        </div>
      </div>
    ),
    size
  );
}
