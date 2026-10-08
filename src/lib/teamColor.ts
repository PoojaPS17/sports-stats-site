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

/** Contrast of white text drawn at `opacity` over this colour (WCAG ratio): the blended colour is what the eye gets. */
export function whiteContrastAt(hex: string, opacity: number): number {
  const blended = [1, 3, 5].map((i) => Math.round(255 * opacity + parseInt(hex.slice(i, i + 2), 16) * (1 - opacity)));
  return (luminance(`#${blended.map((v) => v.toString(16).padStart(2, "0")).join("")}`) + 0.05) / (luminance(hex) + 0.05);
}

/** The faintest white the team card draws its small lines in. */
export const CARD_TEXT_OPACITY = 0.85;

/** The team colour, darkened step by step until white text drawn at `opacity` on it reads at 4.5:1. A colour that already does is
 * returned as it is, so a pale yellow or light blue club still gets a card its white text can be read on. The card's small lines are
 * set at less than full white, so it asks for CARD_TEXT_OPACITY: the guarantee then holds for its faintest line, and so for the rest. */
export function colourForWhiteText(color: string | null | undefined, fallback = "#2563d9", opacity = 1): string {
  let hex = teamHex(color, fallback);
  for (let i = 0; i < 30 && whiteContrastAt(hex, opacity) < 4.5; i++) {
    const rgb = [1, 3, 5].map((k) => Math.round(parseInt(hex.slice(k, k + 2), 16) * 0.92));
    hex = `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }
  return hex;
}
