import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";

export const alt = "SportsDB: live scores, standings and stats";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Default share image for pages without a more specific one.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #0b1220 0%, #16223a 100%)",
          color: "#e8edf6",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <PixelBall size={64} fill="#6ea0ff" live="#f87171" />
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>SportsDB</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5 }}>Live scores, standings and stats</div>
          <div style={{ fontSize: 30, color: "#9aa7bd" }}>Premier League · La Liga · NFL · NBA · IPL · Tennis · F1</div>
        </div>
      </div>
    ),
    size
  );
}
