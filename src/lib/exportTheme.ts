// Fixed palette for downloadable card images. Deliberately hard-coded rather
// than the CSS custom properties the rest of the site uses: an exported PNG is
// looked at outside the page (shared, embedded, printed) and must look the same
// regardless of the viewer's site theme, so it can't inherit --text/--surface,
// which flip to dark values under prefers-color-scheme. The body mirrors the
// site's light-mode tokens (globals.css :root, paper and navy ink) so the card
// still reads as "this site"; the footer band is the fixed brand pair (--navy,
// --volt) that the icons and share images use, whatever the theme.
// tests/export-theme.test.ts checks the two stay in step.
export const CARD = {
  bg: "#f7f5f0",
  surface: "#fffdf9",
  border: "#e3dfd4",
  text: "#141a2b",
  textMuted: "#5d6373",
  textFaint: "#8c9099",
  /** The light theme's signature ink (--sig-ink). Volt itself only goes on navy. */
  accent: "#1e3a8a",
  accentSoft: "#e4e9f7",
  sig: "#c6f135",
  /** The navy band (--navy) and its text, for the footer every card ends with. */
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
