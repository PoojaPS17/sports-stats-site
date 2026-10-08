import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";
import { isLeague, isCricketLeague, LEAGUE_LABEL, getTeamBySlug } from "@/lib/queries";
import { resolveTeamLogo } from "@/lib/teamLogos";
import { verifyLogoUrl } from "@/lib/verifyImageUrl";

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
  const color = team?.color ? `#${team.color.replace(/^#/, "")}` : "#38b6e8";
  // A stored logo_url can be a dead path (cricket sides most often, but any league's could
  // rot) that this route re-checks rather than trusting, since @vercel/og crashes fetching
  // a 404 server-side. resolveTeamLogo applies cricket's curated substitutes first; verifyLogoUrl
  // is the general safety net that catches anything still dead, cricket or not.
  const candidate = team && isLeague(league) && isCricketLeague(league) ? resolveTeamLogo(team.espn_id, team.logo_url) : (team?.logo_url ?? null);
  const logo = await verifyLogoUrl(candidate);

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
          background: "linear-gradient(135deg, #0f2745 0%, #16345a 100%)",
          color: "#eef1f7",
          fontFamily: "sans-serif",
          borderLeft: `28px solid ${color}`,
        }}
      >
        {logo ? (
          <img src={logo} width={260} height={260} alt="" style={{ objectFit: "contain" }} />
        ) : (
          <div style={{ width: 260, height: 260, borderRadius: 130, background: color }} />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 30, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 4 }}>{label}</div>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>{name}</div>
          <div style={{ fontSize: 28, color: "#9aa5bd", marginTop: 12 }}>Fixtures · Results · Roster · History</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 24, color: "#c6f135", marginTop: 28, fontWeight: 700 }}>
            <PixelBall size={26} fill="#ffffff" live="#c6f135" />
            SportsDB
          </div>
        </div>
      </div>
    ),
    size
  );
}
