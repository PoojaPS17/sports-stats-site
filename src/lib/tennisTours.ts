// Pure tennis-tour constants with no database import — safe to use from Client
// Components (see leagues.ts for why this split exists: importing any value from a
// module that imports ./db pulls `pg` into the client bundle and breaks the build).
export type Tour = "atp" | "wta";
export const TOURS: Tour[] = ["atp", "wta"];
export const TOUR_LABEL: Record<Tour, string> = { atp: "ATP", wta: "WTA" };

export function isTour(value: string): value is Tour {
  return TOURS.includes(value as Tour);
}
