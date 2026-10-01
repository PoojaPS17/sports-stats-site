import { PixelBall } from "./Logo";
import { SITE_URL, X_HANDLE } from "@/lib/site";
import { CARD, CARD_DISPLAY_FONT } from "@/lib/exportTheme";

/** "SPORTSDB" for the cards: the site's wordmark as inline styles, DB in Volt. */
export function ExportWordmark({ size = 18 }: { size?: number }) {
  return (
    <span style={{ fontFamily: CARD_DISPLAY_FONT, fontWeight: 800, textTransform: "uppercase", fontSize: size, lineHeight: 1, letterSpacing: "0.01em", color: CARD.mastText }}>
      Sports<span style={{ color: CARD.sig }}>DB</span>
    </span>
  );
}

// The bottom bar every downloadable card ends with: the site's navy masthead with the lit
// block, the wordmark and the domain, so an image that circulates off-site still points
// home, plus what the card is and when it was generated. `inset` is the card's padding and
// `radius` its corner radius: the band bleeds to the card's edges and keeps its corners.
export function ExportFooter({ context, inset = 24, radius = 16 }: { context: string; inset?: number; radius?: number }) {
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const stamp = `${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}, ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hourCycle: "h23" })} UTC`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "8px 16px",
        margin: `20px -${inset}px -${inset}px`,
        padding: `12px ${inset}px`,
        borderRadius: `0 0 ${radius}px ${radius}px`,
        background: CARD.mast,
        color: CARD.mastText,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
        <PixelBall size={18} fill={CARD.mastText} live={CARD.sig} />
        <ExportWordmark size={18} />
        <span style={{ fontSize: 12, color: CARD.mastMuted }}>{domain}</span>
        <span style={{ fontSize: 12, color: CARD.mastMuted }}>·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: CARD.mastMuted }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill={CARD.mastText} aria-hidden="true">
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
          </svg>
          @{X_HANDLE}
        </span>
      </div>
      <div style={{ fontSize: 11, color: CARD.mastMuted, whiteSpace: "nowrap" }}>
        {context} · {stamp}
      </div>
    </div>
  );
}
