// Fixed palette for downloadable card images. Deliberately hard-coded rather
// than the CSS custom properties the rest of the site uses: an exported PNG is
// looked at outside the page (shared, embedded, printed) and must look the same
// regardless of the viewer's site theme, so it can't inherit --text/--surface,
// which flip to dark values under prefers-color-scheme. The body mirrors the
// site's light-mode tokens (globals.css :root, off-white and blue ink) so the card
// still reads as "this site"; the footer band is the deep navy (--navy) carrying the
// logo lockup in its own lit colour (--logo-lit), whatever the theme.
// tests/export-theme.test.ts checks the two stay in step.
export const CARD = {
  bg: "#f7fafc",
  surface: "#ffffff",
  border: "#dde8f2",
  text: "#102a43",
  textMuted: "#4a6178",
  textFaint: "#52697f",
  /** The light theme's signature ink (--sig-ink), Sports Blue. */
  accent: "#2563d9",
  accentSoft: "#eaf2fc",
  /** The lit block and "DB" of the SPORTSDB logo lockup in the footer (--logo-lit). The brand mark keeps its own colour. */
  sig: "#c6f135",
  /** The navy band (--navy) and its text, for the footer every card ends with. */
  mast: "#0f2745",
  mastText: "#eef1f7",
  mastMuted: "#9aa5bd",
  win: "#1b7a43",
  loss: "#ba0329",
} as const;

// One face for everything, Plus Jakarta Sans. The cards are captured inside the page,
// where next/font defines --font-jakarta, so the variable resolves to the self-hosted
// font. (The server-rendered player card names the family directly: see
// PerformanceCard and cardFont.ts.)
export const CARD_FONT = 'var(--font-jakarta), "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const CARD_DISPLAY_FONT = CARD_FONT;
