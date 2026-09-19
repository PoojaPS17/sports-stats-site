import { PixelBall } from "./Logo";
import { SITE_URL, X_HANDLE } from "@/lib/site";
import { CARD } from "@/lib/exportTheme";

// The bottom bar every downloadable card ends with: the mark and domain so an image
// that circulates off-site still points back home, plus what the card is and when it
// was generated - the same "site + handle + timestamp" footer ps-store-db.live uses.
export function ExportFooter({ context }: { context: string }) {
  const domain = SITE_URL.replace(/^https?:\/\//, "");
  const stamp = `${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}, ${new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false })} UTC`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 20,
        paddingTop: 16,
        borderTop: `1px solid ${CARD.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PixelBall size={20} fill={CARD.accent} live={CARD.loss} />
        <span style={{ fontSize: 14, fontWeight: 800, color: CARD.text }}>SportsDB</span>
        <span style={{ fontSize: 13, color: CARD.textFaint }}>{domain}</span>
        <span style={{ fontSize: 13, color: CARD.textFaint }}>· @{X_HANDLE}</span>
      </div>
      <div style={{ fontSize: 12, color: CARD.textFaint, textAlign: "right" }}>
        {context} · {stamp}
      </div>
    </div>
  );
}
