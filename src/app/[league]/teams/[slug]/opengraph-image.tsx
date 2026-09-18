import { ImageResponse } from "next/og";
import { isLeague, LEAGUE_LABEL, getTeamBySlug } from "@/lib/queries";

export const alt = "Team page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

// Share image for a team page: crest, name and competition.
export default async function Image({ params }: { params: Promise<{ league: string; slug: string }> }) {
  const { league, slug } = await params;
  const team = isLeague(league) ? await getTeamBySlug(league, slug) : null;
  const name = team?.name ?? "SportsDB";
  const label = isLeague(league) ? LEAGUE_LABEL[league] : "";
  const color = team?.color ? `#${team.color.replace(/^#/, "")}` : "#6ea0ff";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 56,
          padding: 72,
          background: "linear-gradient(135deg, #0b1220 0%, #16223a 100%)",
          color: "#e8edf6",
          fontFamily: "sans-serif",
          borderLeft: `28px solid ${color}`,
        }}
      >
        {team?.logo_url ? (
          <img src={team.logo_url} width={260} height={260} alt="" style={{ objectFit: "contain" }} />
        ) : (
          <div style={{ width: 260, height: 260, borderRadius: 130, background: color }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 30, color: "#9aa7bd", textTransform: "uppercase", letterSpacing: 4 }}>{label}</div>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{name}</div>
          <div style={{ fontSize: 28, color: "#9aa7bd", marginTop: 12 }}>Fixtures · Results · Roster · History</div>
          <div style={{ fontSize: 24, color: "#6ea0ff", marginTop: 28, fontWeight: 700 }}>SportsDB</div>
        </div>
      </div>
    ),
    size
  );
}
