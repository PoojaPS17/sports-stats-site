import { CARD } from "./exportTheme";

// WCAG relative luminance of an sRGB color (0..1).
function relativeLuminance(hex: string): number {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #rrggbb-less hex colors (no leading #), 1 (no contrast) to 21 (max). */
export function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexA);
  const lb = relativeLuminance(hexB);
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The card's accent color for a team: the team's own stored color when it clears a 3:1
 * contrast check against the card's white surface (CARD.surface), else CARD.accent. Null
 * (no stored color) always falls back to CARD.accent. See design doc §1 ("Contrast must
 * be checked for team colours that are very light").
 */
export function cardAccentColor(teamColor: string | null): string {
  if (!teamColor) return CARD.accent;
  const hex = teamColor.replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) return CARD.accent;
  const surfaceHex = CARD.surface.replace(/^#/, "").toLowerCase();
  return contrastRatio(hex, surfaceHex) >= 3 ? `#${hex}` : CARD.accent;
}
