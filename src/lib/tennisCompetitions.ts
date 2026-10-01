// Pure tennis-competition constants with no database import — safe to use from Client
// Components (see tennisTours.ts and leagues.ts for why this split exists: importing
// any value from a module that imports ./db pulls `pg` into the client bundle and
// breaks the build).
export type CompetitionType = "mens-singles" | "womens-singles" | "mens-doubles" | "womens-doubles" | "mixed-doubles" | "team-cup";

export const COMPETITION_LABEL: Record<CompetitionType, string> = {
  "mens-singles": "Men's Singles",
  "womens-singles": "Women's Singles",
  "mens-doubles": "Men's Doubles",
  "womens-doubles": "Women's Doubles",
  "mixed-doubles": "Mixed Doubles",
  // Davis Cup, United Cup...: ESPN files the singles and the doubles rubbers of a tie under this one type.
  "team-cup": "Team Cup",
};

// Display order within a tournament: singles first, then the doubles draws.
export const COMPETITION_ORDER: CompetitionType[] = ["mens-singles", "womens-singles", "mens-doubles", "womens-doubles", "mixed-doubles", "team-cup"];
