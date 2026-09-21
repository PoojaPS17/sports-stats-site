// Team names for display. ESPN's `vehicle.manufacturer` (and its constructors list) carries each team's CURRENT
// name in every season it has data for: Renault 2016-20 reads "Alpine", Toro Rosso 2016-19 reads "AlphaTauri",
// the team that raced as Red Bull Racing reads "Red Bull". The reference site uses the name the team raced under.
// The stored names stay as ESPN sent them (the team page matches results on `constructor_name = teams.name`);
// only what a visitor reads goes through f1TeamLabel().

/** ESPN manufacturer ids (the id in a constructors' standings entry) and the name ESPN gives them. */
const CONSTRUCTOR_NAMES: Record<string, string> = {
  "106893": "Mercedes",
  "106921": "Red Bull",
  "106842": "Ferrari",
  "106846": "Force India",
  "106967": "Williams",
  "106892": "McLaren",
  "106952": "AlphaTauri", // Toro Rosso until 2019
  "111427": "Haas",
  "106922": "Alpine", // Renault until 2020
  "111432": "Manor",
  "111838000": "Racing Point",
  "123986": "Aston Martin",
  "123988": "Racing Bulls",
  "106925": "Sauber", // Kick Sauber in 2024-25
  "132212": "Audi",
  "132211": "Cadillac",
};

/**
 * The name ESPN uses for a constructors' standings entry in a season, or null for an id this table does not know.
 * The one id that is two companies is 106792: Sauber's own entry to 2018, Alfa Romeo from 2019 (ESPN's vehicle field
 * calls the first "Sauber" and the second "Alfa Romeo").
 */
export function f1ConstructorEspnName(manufacturerId: string, season: number): string | null {
  if (manufacturerId === "106792") return season <= 2018 ? "Sauber" : "Alfa Romeo";
  return CONSTRUCTOR_NAMES[manufacturerId] ?? null;
}

/** ESPN leaves the manufacturer off Sauber's cars in these seasons (Bottas and Zhou 2024, Bortoleto and Hulkenberg 2025). */
const SAUBER_NO_MANUFACTURER = new Set([2024, 2025]);

/**
 * What a team is called in a season, from the name ESPN stored. A driver with no team on file in 2024-25 raced for
 * Kick Sauber. Anything not listed reads as ESPN has it.
 */
export function f1TeamLabel(season: number | null | undefined, espnName: string | null | undefined): string | null {
  if (!espnName) return season != null && SAUBER_NO_MANUFACTURER.has(season) ? "Kick Sauber" : null;
  if (season == null) return espnName;
  switch (espnName) {
    case "Red Bull":
      return "Red Bull Racing";
    case "Haas":
      return "Haas F1 Team";
    case "Alpine":
      return season <= 2020 ? "Renault" : "Alpine";
    case "AlphaTauri":
      return season <= 2019 ? "Toro Rosso" : "AlphaTauri";
    case "Alfa Romeo":
      return season <= 2020 ? "Alfa Romeo Racing" : "Alfa Romeo";
    case "Racing Point":
      return season <= 2018 ? "Force India" : "Racing Point"; // 2018: the Racing Point Force India entry, which Wikipedia's standings call Force India
    case "Racing Bulls":
      return season === 2024 ? "RB" : "Racing Bulls"; // the Visa Cash App RB team raced as "RB" in 2024
    case "Sauber":
      return season >= 2024 ? "Kick Sauber" : "Sauber";
    default:
      return espnName;
  }
}
