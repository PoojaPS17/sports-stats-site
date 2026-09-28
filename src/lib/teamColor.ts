import type { CSSProperties } from "react";

// ESPN stores a team's colour as bare hex ("003594"); a few rows carry a leading #.
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function teamHex(color: string | null | undefined, fallback = "#64748b"): string {
  const m = color?.trim().match(HEX);
  if (!m) return fallback;
  const h = m[1].toLowerCase();
  return `#${h.length === 3 ? h.split("").map((c) => c + c).join("") : h}`;
}

/** The two-tone stripe on a match card: home or first side on top, the other below. */
export function stripeStyle(c1: string | null | undefined, c2: string | null | undefined): CSSProperties {
  return { "--c1": teamHex(c1), "--c2": teamHex(c2) } as CSSProperties;
}
