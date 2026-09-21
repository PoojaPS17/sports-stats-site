// Where a Grand Prix is held, for display. ESPN's circuit records are wrong in a few places: the Spanish circuit's record was
// renamed to the Madrid circuit for 2026 and so reads that for every year since 2016, Imola is filed under Rome, and a
// region stands in for the city at Miami, Las Vegas and Mugello. The stored values stay as ESPN sent them; corrections are
// keyed on ESPN's circuit name and the season, and applied where an event is read (src/lib/f1.ts).

export interface F1Venue {
  name: string | null;
  city: string | null;
  country: string | null;
}

interface CircuitFix {
  /** ESPN's circuit name, exactly as stored. */
  circuit: string;
  /** First and last season the fix covers; every season when left out. */
  seasons?: [number, number];
  set: Partial<F1Venue>;
}

const CIRCUIT_FIXES: CircuitFix[] = [
  // ESPN circuit 605 is the new Madrid circuit; before 2026 the Spanish Grand Prix was at Barcelona-Catalunya.
  { circuit: "Madring", seasons: [2016, 2025], set: { name: "Circuit de Barcelona-Catalunya", city: "Montmeló", country: "Spain" } },
  // ESPN's 2026 record for the same track (circuit 5826, city Barcelona): Wikipedia's 2026 calendar has the Barcelona-Catalunya Grand Prix
  // at the Circuit de Barcelona-Catalunya in Montmeló, so it reads as the 2016-25 Spanish Grands Prix above.
  { circuit: "Circuit de Catalunya", set: { name: "Circuit de Barcelona-Catalunya", city: "Montmeló" } },
  { circuit: "Autodromo Enzo e Dino Ferrari", set: { city: "Imola" } }, // ESPN: Rome
  { circuit: "Nürburgring", set: { city: "Nürburg" } }, // ESPN: Nuremberg (2020 Eifel Grand Prix)
  { circuit: "Miami International Autodrome", set: { city: "Miami" } }, // ESPN: Florida
  { circuit: "Las Vegas Street Circuit", set: { city: "Las Vegas" } }, // ESPN: Nevada
  { circuit: "Autodromo Internazionale del Mugello", set: { city: "Mugello" } }, // ESPN: Tuscany
  // Wikipedia's circuit pages and its season calendars give the location as ESPN does for Spa (Stavelot), so it is left as stored.
  { circuit: "Sepang International Circuit", set: { city: "Sepang" } }, // ESPN: Kuala Lumpur; Wikipedia's circuit page: Sepang, Selangor
  { circuit: "Hungaroring", set: { city: "Mogyoród" } }, // ESPN: Budapest; Wikipedia: Mogyoród, Pest County
  { circuit: "Silverstone Circuit", set: { country: "UK" } }, // ESPN: Britain
];

/** Events ESPN stores with no circuit at all. */
const EVENT_VENUES: Record<string, F1Venue> = {
  // 2016 European Grand Prix, run on the Baku street circuit.
  "18777": { name: "Baku City Circuit", city: "Baku", country: "Azerbaijan" },
};

// The event queries initcap() the country to tidy ESPN's casing, which turns an initialism into "Usa".
const INITIALISMS = /^(usa|uae|uk)$/i;

export function f1Venue(ev: { eventId: string; season: number | null; name: string | null; city: string | null; country: string | null }): F1Venue {
  const stored: F1Venue = { name: ev.name, city: ev.city, country: ev.country && INITIALISMS.test(ev.country) ? ev.country.toUpperCase() : ev.country };
  if (!ev.name) return EVENT_VENUES[ev.eventId] ?? stored;
  for (const fix of CIRCUIT_FIXES) {
    if (fix.circuit !== ev.name) continue;
    if (fix.seasons && (ev.season == null || ev.season < fix.seasons[0] || ev.season > fix.seasons[1])) continue;
    return { ...stored, ...fix.set };
  }
  return stored;
}

/**
 * The zone a circuit's dates are read in. A race weekend's date is the day at the circuit, and on a race day that is the UTC
 * date everywhere but Las Vegas, where the Race starts at 10 pm local (04:00 UTC the next day).
 */
const CIRCUIT_TIME_ZONES: Record<string, string> = {
  "Las Vegas Street Circuit": "America/Los_Angeles",
};

// An event stored with no circuit (ESPN's feed sometimes has none) is still in Las Vegas: the Las Vegas Grand Prix, 2023-2026.
const EVENT_TIME_ZONES: Record<string, string> = {
  "600026789": "America/Los_Angeles",
  "600041157": "America/Los_Angeles",
  "600052106": "America/Los_Angeles",
  "600057449": "America/Los_Angeles",
};

export function f1CircuitTimeZone(circuitName: string | null | undefined, eventId?: string | null): string {
  return (eventId && EVENT_TIME_ZONES[eventId]) || (circuitName && CIRCUIT_TIME_ZONES[circuitName]) || "UTC";
}
