import { PixelBall } from "./Logo";
import { SITE_URL, X_HANDLE } from "@/lib/site";
import { CARD } from "@/lib/exportTheme";

// The bottom bar every downloadable card ends with: the mark and domain so an image
// that circulates off-site still points back home, plus what the card is and when it
// was generated - the same "site + handle + timestamp" footer ps-store-db.live uses.
export function ExportFooter({ context }: { context: string }) {
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
        marginTop: 20,
        paddingTop: 16,
        borderTop: `1px solid ${CARD.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
        <PixelBall size={20} fill={CARD.accent} live={CARD.loss} />
        <span style={{ fontSize: 14, fontWeight: 800, color: CARD.text }}>SportsDB</span>
        <span style={{ fontSize: 13, color: CARD.textFaint }}>{domain}</span>
        <span style={{ fontSize: 13, color: CARD.textFaint }}>·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: CARD.textFaint }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={CARD.text} aria-hidden="true">
            <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
          </svg>
          @{X_HANDLE}
        </span>
      </div>
      <div style={{ fontSize: 12, color: CARD.textFaint, whiteSpace: "nowrap" }}>
        {context} · {stamp}
      </div>
    </div>
  );
}
