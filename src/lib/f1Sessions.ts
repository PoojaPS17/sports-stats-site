// The sessions of a race weekend, as a visitor reads them. ESPN's abbreviations: FP1 FP2 FP3 Qual Race, "Sprint" (the 2021-22
// sprint), and for 2023 onward "SS" (its text is "Sprint Shootout" every year) and "SR" ("Sprint Race").

/** 2023's sprint qualifying was called the Sprint Shootout; from 2024 it is Sprint Qualifying. */
export function f1SessionLabel(season: number | null | undefined, sessionType: string): string {
  switch (sessionType) {
    case "FP1":
      return "Free Practice 1";
    case "FP2":
      return "Free Practice 2";
    case "FP3":
      return "Free Practice 3";
    case "Qual":
      return "Qualifying";
    case "SS":
      return season === 2023 ? "Sprint Shootout" : "Sprint Qualifying";
    case "SR":
    case "Sprint":
      return "Sprint";
    case "Race":
      return "Race";
    default:
      return sessionType;
  }
}

// The order a weekend was run in. It differs by format, so it is not one list: in 2021-22 qualifying came before the
// second practice and the sprint, in 2023 qualifying came before the shootout, and from 2024 sprint qualifying came
// before qualifying. (Session dates are no help: ESPN dates one 2018 practice with the event's own date.)
const ORDER_2021_22 = ["FP1", "Qual", "FP2", "FP3", "Sprint", "Race"];
const ORDER_2023 = ["FP1", "Qual", "SS", "SR", "FP2", "FP3", "Race"];
const ORDER_2024_ON_SPRINT = ["FP1", "SS", "SR", "Qual", "FP2", "FP3", "Race"];
const ORDER_STANDARD = ["FP1", "FP2", "FP3", "Qual", "Race"];

function orderFor(season: number | null | undefined, types: string[]): string[] {
  if (types.includes("Sprint")) return ORDER_2021_22;
  if (types.includes("SS") || types.includes("SR")) return season === 2023 ? ORDER_2023 : ORDER_2024_ON_SPRINT;
  return ORDER_STANDARD;
}

/** The sessions of one weekend in the order they were run; a session of a type not listed goes last. */
export function sortF1Sessions<T extends { session_type: string }>(season: number | null | undefined, sessions: T[]): T[] {
  const order = orderFor(season, sessions.map((s) => s.session_type));
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
  return [...sessions].sort((a, b) => rank(a.session_type) - rank(b.session_type));
}

/**
 * The podium of a weekend: the drivers classified first, second and third in the Race.
 *
 * The place shown is the driver's own finishing position, never their index in this list. A
 * disqualification is removed from the classification rather than renumbering the drivers behind it,
 * so a list read positionally could caption a P4 finisher "3rd" — the one claim on a share card that
 * would be flatly untrue. A weekend with no Race session on file, one still to come and a cancelled
 * one all yield nothing, which is what a card with no result to show wants.
 */
export function f1Podium<T extends { session_type: string; completed: boolean; position: number | null }>(results: T[]): T[] {
  return results.filter((r) => r.session_type === "Race" && r.completed && r.position !== null && r.position >= 1 && r.position <= 3);
}
