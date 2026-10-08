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

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Contrast of white text on this colour (WCAG ratio). */
export function whiteContrast(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/** The team colour, darkened step by step until white text on it reads at 4.5:1. A colour that already does is returned as it is,
 * so a pale yellow or light blue club still gets a card its white text can be read on. */
export function colourForWhiteText(color: string | null | undefined, fallback = "#1470af"): string {
  let hex = teamHex(color, fallback);
  for (let i = 0; i < 20 && whiteContrast(hex) < 4.5; i++) {
    const rgb = [1, 3, 5].map((k) => Math.round(parseInt(hex.slice(k, k + 2), 16) * 0.92));
    hex = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return hex;
}
