// Fixed light palette for downloadable card images. Deliberately hard-coded rather
// than the CSS custom properties the rest of the site uses: an exported PNG is
// looked at outside the page (shared, embedded, printed) and must look the same
// regardless of the viewer's site theme, so it can't inherit --text/--surface,
// which flip to dark values under prefers-color-scheme. Mirrors the site's own
// light-mode tokens (globals.css :root) so the card still reads as "this site";
// tests/export-theme.test.ts checks the two stay in step.
export const CARD = {
  bg: "#f3f4f8",
  surface: "#ffffff",
  border: "#dde1ea",
  text: "#0b1324",
  textMuted: "#5a6478",
  textFaint: "#8b95a8",
  /** Volt's readable ink on a white surface (--sig-ink). Volt itself only goes on navy. */
  accent: "#4d7c0f",
  accentSoft: "#eef9c9",
  sig: "#c6f135",
  /** The masthead band (--mast) and its text, for the footer every card ends with. */
  mast: "#0b1324",
  mastText: "#eef1f7",
  mastMuted: "#9aa5bd",
  win: "#15803d",
  loss: "#b91c1c",
} as const;

export const CARD_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// The headline face for titles, scores and the wordmark. The cards are captured inside
// the page, where next/font defines --font-barlow, so the variable resolves to the
// self-hosted Barlow Condensed. (The server-rendered player card names the family
// directly: see PerformanceCard and cardFont.ts.)
export const CARD_DISPLAY_FONT = 'var(--font-barlow), "Barlow Condensed", "Arial Narrow", sans-serif';
