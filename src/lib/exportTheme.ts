// Fixed palette for downloadable card images. Deliberately hard-coded rather
// than the CSS custom properties the rest of the site uses: an exported PNG is
// looked at outside the page (shared, embedded, printed) and must look the same
// regardless of the viewer's site theme, so it can't inherit --text/--surface,
// which flip to dark values under prefers-color-scheme. The body mirrors the
// site's light-mode tokens (globals.css :root, off-white and blue ink) so the card
// still reads as "this site"; the footer band is the fixed brand pair (--navy,
// --volt) that the icons and share images use, whatever the theme.
// tests/export-theme.test.ts checks the two stay in step.
export const CARD = {
  bg: "#fafaf7",
  surface: "#ffffff",
  border: "#b8d4ec",
  text: "#060640",
  textMuted: "#4a4a72",
  textFaint: "#646488",
  /** The light theme's signature ink (--sig-ink). Volt itself only goes on navy. */
  accent: "#1470af",
  accentSoft: "#eaf2fa",
  sig: "#c6f135",
  /** The navy band (--navy) and its text, for the footer every card ends with. */
  mast: "#0b1324",
  mastText: "#eef1f7",
  mastMuted: "#9aa5bd",
  win: "#006717",
  loss: "#ba0329",
} as const;

// One face for everything, Plus Jakarta Sans. The cards are captured inside the page,
// where next/font defines --font-jakarta, so the variable resolves to the self-hosted
// font. (The server-rendered player card names the family directly: see
// PerformanceCard and cardFont.ts.)
export const CARD_FONT = 'var(--font-jakarta), "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const CARD_DISPLAY_FONT = CARD_FONT;
