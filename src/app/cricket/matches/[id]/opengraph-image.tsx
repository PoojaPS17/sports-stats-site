import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";
import { getCricketSeriesMatch } from "@/lib/cricketSeries";
import { overlayLiveCricket } from "@/lib/cricketLive";
import { cricketMatchCardModel, type MatchCardSide } from "@/lib/cricketShareCards";
import { resolveTeamLogo } from "@/lib/teamLogos";
import { verifyLogoUrl } from "@/lib/verifyImageUrl";

export const alt = "Cricket match";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

// Dynamic on purpose: no generateStaticParams here, so the score on the card is read fresh each time, as the
// game card beside /[league]/games does. The window above still sets the default for the cached fetches
// inside this render. The proxy leaves image paths alone (its matcher skips opengraph-image), so a finished
// match rendered under /cricket/matches/final/<id> still has its card at /cricket/matches/<id>/opengraph-image,
// which cricketMatchMetadata names outright.

const BG = "linear-gradient(135deg, #0b1324 0%, #121c33 100%)";

/** A side's name steps down for the long domestic ones ("Khan Research Laboratories"). */
function nameSize(name: string): number {
  return name.length > 22 ? 28 : 34;
}

/** The big figure steps down for a two-innings score ("259 & 376/7"), which would otherwise wrap. */
function scoreSize(main: string): number {
  return main.length > 7 ? 60 : 96;
}

function Side({ side, logo }: { side: MatchCardSide; logo: string | null }) {
  const color = side.muted ? "#9aa5bd" : "#eef1f7";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, width: 400 }}>
      {logo ? <img src={logo} width={170} height={170} alt="" style={{ objectFit: "contain" }} /> : <div style={{ width: 170, height: 170, borderRadius: 85, background: "#1b2640" }} />}
      <div style={{ fontSize: nameSize(side.name), fontWeight: 700, textAlign: "center", color }}>{side.name}</div>
      {side.score && <div style={{ fontSize: scoreSize(side.score.main), fontWeight: 800, lineHeight: 1, color, whiteSpace: "nowrap" }}>{side.score.main}</div>}
      {side.score?.detail && <div style={{ fontSize: 28, fontWeight: 600, color: "#9aa5bd" }}>{side.score.detail}</div>}
    </div>
  );
}

/**
 * Share card of a cricket match page, in the game card's shape: both crests, the scores once there are any,
 * the stage and series above and the result in full names below. Matches with a stored scorecard redirect
 * to their league's game page, which has its own card; the ones here are the domestic and minor-series
 * matches that shared the generic card until now.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = await getCricketSeriesMatch(id);
  if (!stored) {
    return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#0b1324", color: "#eef1f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>SportsDB</div>, size);
  }
  // ESPN's current state over the stored row, so a match in play shows its live score, as the series page does.
  const m = (await overlayLiveCricket([stored], stored.series_espn_id)).find((r) => r.espn_id === id) ?? stored;
  const card = cricketMatchCardModel(m);
  // A stored logo_url can be a dead path (many cricket sides have none): resolveTeamLogo applies the curated
  // substitutes, verifyLogoUrl catches anything still dead, since @vercel/og throws on a 404 fetched server-side.
  const [homeLogo, awayLogo] = await Promise.all(card.sides.map((s) => verifyLogoUrl(resolveTeamLogo(s.id, s.logo))));

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 56, background: BG, color: "#eef1f7", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 24, fontSize: 26, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 3 }}>
          {/* A long series name is cut with an ellipsis rather than running into the date. */}
          <span style={{ display: "block", maxWidth: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{card.eyebrow}</span>
          <span style={{ display: "block", whiteSpace: "nowrap", flexShrink: 0 }}>{card.when}</span>
        </div>
        {/* Crests level at the top, so a side yet to bat sits beside the other's score rather than floating. */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Side side={card.sides[0]} logo={homeLogo} />
          <div style={{ display: "flex", justifyContent: "center", textAlign: "center", marginTop: 60, ...(card.middle && card.middle !== "vs" ? { width: 280, fontSize: 28, color: "#9aa5bd" } : { fontSize: 40, color: "#6b7890" }), fontWeight: 700 }}>{card.middle ?? ""}</div>
          <Side side={card.sides[1]} logo={awayLogo} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: "#c6f135", fontWeight: 700, whiteSpace: "nowrap" }}>
            <PixelBall size={28} fill="#ffffff" live="#c6f135" />
            SportsDB
          </div>
          {card.line && <div style={{ display: "flex", fontSize: card.line.length > 60 ? 22 : 26, color: "#eef1f7", fontWeight: 600, textAlign: "right", maxWidth: 820 }}>{card.line}</div>}
        </div>
      </div>
    ),
    size
  );
}
