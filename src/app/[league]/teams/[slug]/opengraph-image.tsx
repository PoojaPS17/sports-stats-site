import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";
import { isLeague, LEAGUE_LABEL, getTeamBySlug } from "@/lib/queries";

export const alt = "Team page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand and 404 (dynamicParams is left at its default).
export function generateStaticParams() {
  return [];
}

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
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, color: "#6ea0ff", marginTop: 28, fontWeight: 700 }}>
            <PixelBall size={26} fill="#6ea0ff" live="#f87171" />
            SportsDB
          </div>
        </div>
      </div>
    ),
    size
  );
}
