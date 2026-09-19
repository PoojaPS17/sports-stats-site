// The Google Analytics measurement id for the sports-db.live web stream. It is public
// (it appears in every page's HTML), so it lives here rather than in Vercel's settings;
// NEXT_PUBLIC_GA_ID overrides it. Analytics runs on production builds only, so local
// development never sends hits.
const PRODUCTION_GA_ID = "G-4B4HBLW466";
export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || (process.env.NODE_ENV === "production" ? PRODUCTION_GA_ID : null);

// Where the law asks for consent before an analytics cookie is set: the EU and the
// rest of the EEA, the UK and Switzerland. Elsewhere analytics starts straight away,
// and anyone can still turn it off from the privacy page.
export const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
];

export const CONSENT_KEY = "analytics-consent";
export const COOKIE_SETTINGS_EVENT = "sportsdb:cookie-settings";
