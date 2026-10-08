import { ImageResponse } from "next/og";
import { PixelBall } from "@/components/Logo";
import { getF1Event, getF1EventResults } from "@/lib/f1";
import { f1EventStatus } from "@/lib/f1Status";
import { f1FormatDate, f1RaceInstant } from "@/lib/f1Dates";
import { f1Podium } from "@/lib/f1Sessions";

export const alt = "Formula 1 race weekend";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300;

// An empty list, so nothing is built up front: each card is drawn on the first request and then
// served from the cache above until it goes stale — the same bargain the page beside it makes.
export function generateStaticParams() {
  return [];
}

const BG = "linear-gradient(135deg, #0f2745 0%, #16345a 100%)";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 56,
        background: BG,
        color: "#eef1f7",
        fontFamily: "sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function Footer() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 26, color: "#c6f135", fontWeight: 700 }}>
      <PixelBall size={28} fill="#ffffff" live="#c6f135" />
      SportsDB
    </div>
  );
}

/** Gold, silver, bronze — the three the card is for; anything else would not be on it. */
const PLACE_COLOR = ["#f0c14b", "#c6ced9", "#cd8a52"];

function PodiumRow({ place, driver, constructor }: { place: number; driver: string; constructor: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 27, background: PLACE_COLOR[place - 1], color: "#0f2745", fontSize: 30, fontWeight: 800 }}>
        {place}
      </div>
      <div style={{ display: "flex", flex: 1, fontSize: 40, fontWeight: 700 }}>{driver}</div>
      {constructor && <div style={{ display: "flex", fontSize: 26, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 2 }}>{constructor}</div>}
    </div>
  );
}

/**
 * Share card for a Grand Prix weekend: the circuit, the day of the race, and the podium once it has
 * been run. Every weekend page used to fall back to the site's generic card, so 241 different races
 * looked like the same link when shared, and Search Console read every one as an Event with no image.
 * No crests here, unlike a match card — a Grand Prix has no two sides, so nothing is fetched over the
 * network to draw it and none of the dead-logo checking a match card needs applies.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getF1Event(id);
  if (!event) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", background: "#0f2745", color: "#eef1f7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>SportsDB</div>,
      size
    );
  }

  const year = event.season_year ?? new Date(event.date).getUTCFullYear();
  const status = f1EventStatus(event);
  const when = f1FormatDate(f1RaceInstant(event), event.circuit_name, { weekday: "short", month: "short", day: "numeric", year: "numeric" }, event.espn_id);
  const where = [event.circuit_city, event.circuit_country].filter(Boolean).join(", ");

  // getF1EventResults returns a race's rows already in classification order (f1RaceOrder.ts), so no
  // re-sorting here; f1Podium picks the three by their own finishing position rather than by where
  // they sit in the list, and yields none for a weekend with no Race session on file.
  const results = await getF1EventResults(id);
  const podium = f1Podium(results);

  return new ImageResponse(
    (
      <Frame>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#9aa5bd", textTransform: "uppercase", letterSpacing: 3 }}>
          <span>Formula 1</span>
          <span>{status.kind === "called-off" && status.label ? `${status.label} · ${when}` : when}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 800 }}>{`${year} ${event.name}`}</div>
          {event.circuit_name && <div style={{ display: "flex", fontSize: 30, color: "#9aa5bd" }}>{event.circuit_name}</div>}
          {where && <div style={{ display: "flex", fontSize: 26, color: "#6b7890" }}>{where}</div>}
        </div>

        {podium.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {podium.map((r) => (
              <PodiumRow key={r.driver_espn_id} place={r.position as number} driver={r.driver_name} constructor={r.constructor_name} />
            ))}
          </div>
        ) : (
          // Nothing invented for a weekend with no classification yet: the card says which state it is
          // in and stops there, the way a fixture card carries no score. A called-off weekend says so
          // in the header already, so this line stays empty rather than repeating the word.
          <div style={{ display: "flex", fontSize: 34, color: "#6b7890", fontWeight: 700 }}>
            {status.kind === "called-off" ? "" : status.kind === "live" ? "Race weekend under way" : "Race weekend"}
          </div>
        )}

        <Footer />
      </Frame>
    ),
    size
  );
}
