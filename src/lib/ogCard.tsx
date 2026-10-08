import { realPosition } from "@/lib/position";
import type { ReactElement } from "react";
import { PixelBall } from "@/components/Logo";

export const OG_SIZE = { width: 1200, height: 630 };

/** The plain brand card for an address that names nothing we hold, matching the other share-image routes. */
export function ogFallback(): ReactElement {
  return <div style={{ width: "100%", height: "100%", background: "#0f2745", color: "#eef1f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>SportsDB</div>;
}

/** A position worth printing on a card: ESPN's cricket feed marks an unknown role "UKN", which is a gap, not a position. */
export const ogPosition = realPosition;

/** A long name steps down so it stays on two lines at most. */
export function ogTitleSize(title: string, base = 72): number {
  return title.length > 48 ? base - 20 : title.length > 32 ? base - 10 : base;
}

/**
 * The share-card frame used by the league hub, player and head-to-head pages: kicker over a large title,
 * an optional line of detail, and the SportsDB mark, on the navy gradient with the team colour as a left edge.
 */
export function ogCard({ kicker, title, detail, color = "#38b6e8", children }: { kicker: string; title: string; detail?: string; color?: string; children?: ReactElement }): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 18,
        padding: "0 72px",
        background: "linear-gradient(135deg, #0f2745 0%, #16345a 100%)",
        color: "#eef1f7",
        fontFamily: "sans-serif",
        borderLeft: `28px solid ${color}`,
      }}
    >
      <div style={{ fontSize: 30, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 4 }}>{kicker}</div>
      <div style={{ fontSize: ogTitleSize(title), fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{title}</div>
      {children}
      {detail && <div style={{ fontSize: 30, color: "#9aa5bd" }}>{detail}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, color: "#c6f135", marginTop: 24, fontWeight: 700 }}>
        <PixelBall size={26} fill="#ffffff" live="#c6f135" />
        SportsDB
      </div>
    </div>
  );
}

/**
 * The record with the rivalry label and the last results beside it, for the head-to-head share image. The
 * renderer wants an explicit display on any element with more than one child, so every text here is one string.
 */
export function ogRivalry({ record, label, pills }: { record: string; label: string | null; pills: { text: string; border: string }[] }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
      <div style={{ fontSize: 96, fontWeight: 800, color: "#38b6e8", letterSpacing: -2 }}>{record}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {label && <div style={{ fontSize: 34, fontWeight: 700 }}>{label}</div>}
        {pills.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 22, color: "#9aa5bd" }}>{`Last ${pills.length}`}</div>
            {pills.map((p, i) => (
              <div key={i} style={{ display: "flex", padding: "2px 10px", borderRadius: 999, border: `3px solid ${p.border}`, background: "#1d3f6b", fontSize: 20, fontWeight: 700 }}>
                {p.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
