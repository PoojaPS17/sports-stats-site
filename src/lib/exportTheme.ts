// Fixed light palette for downloadable card images. Deliberately hard-coded rather
// than the CSS custom properties the rest of the site uses: an exported PNG is
// looked at outside the page (shared, embedded, printed) and must look the same
// regardless of the viewer's site theme, so it can't inherit --text/--surface,
// which flip to dark values under prefers-color-scheme. Mirrors the site's own
// light-mode tokens (globals.css :root) so the card still reads as "this site."
export const CARD = {
  bg: "#f4f6fa",
  surface: "#ffffff",
  border: "#e1e6ef",
  text: "#0f172a",
  textMuted: "#5b6577",
  textFaint: "#8a94a6",
  accent: "#1d4ed8",
  accentSoft: "#e6eeff",
  win: "#15803d",
  loss: "#b91c1c",
} as const;

export const CARD_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
