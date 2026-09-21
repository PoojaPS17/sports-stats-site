// The country label a visitor reads for a tennis player. ESPN's country code for a player is its flag filename
// (scripts/fetch-tennis-daily.ts countryFromLogo), and a few of those are older codes than the ones the tours and
// every results page print: Djokovic is "SER", the tour says "SRB". The stored code is kept as it is, because it
// names the flag image; only what is shown is mapped, here, for every place that shows a tennis country.
const DISPLAY: Record<string, string> = {
  SER: "SRB", // Serbia
  ROM: "ROU", // Romania
  MOR: "MAR", // Morocco
  SIN: "SGP", // Singapore
  TPO: "TPE", // Taiwan (Chinese Taipei)
  TAI: "TPE",
  IRN: "IRI", // Iran
  NGA: "NGR", // Nigeria
  LIB: "LBN", // Lebanon
  HTI: "HAI", // Haiti
  BHR: "BRN", // Bahrain
  FJI: "FIJ", // Fiji
  CHL: "CHI", // Chile
};

/** The code to print for a stored ESPN country code; null when there is none. */
export function displayCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return DISPLAY[upper] ?? upper;
}
