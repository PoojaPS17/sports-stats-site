// The order of a Grand Prix's classification and the Ret / DSQ / NC / DNS labels beside it.
//
// ESPN's own `order` is right for the front of the field, and for every driver who was classified, but not for the back: it
// puts drivers who retired on lap 1 above ones who lasted 30 laps, leaves a disqualified driver among the finishers, shares
// one order between two drivers, and lists no row at all for a driver who did not start. Two layers fix that, so that the
// order and the labels agree with f1.com:
//   1. A rule over ESPN's own per-driver status and laps completed (stored by scripts/backfill-f1-events.ts). A disqualified
//      driver is labelled DSQ and goes last; a driver who did not start is labelled DNS and goes before him. A driver ESPN calls
//      retired is labelled Ret (or NC) ONLY when he completed clearly less than 90% of the winner's laps (the FIA's
//      classification line, see f1DistanceZone): ESPN says "Retired" of drivers who stopped in the last laps and were still
//      classified, and f1.com prints their number, so a retired driver at or over the line keeps ESPN's position and order.
//      Drivers under the line come after the classified ones, by laps completed (most first). It never invents a result: with
//      no stored status or laps a race is left in ESPN's order and numbers, exactly as before.
//   2. A per-race table (below) for the races where the rule cannot be right, because ESPN's status or laps are wrong for
//      a driver (2021 Brazil: two retirements are STATUS_CLASSIFIED), or two drivers are level, or f1.com keeps a
//      disqualified driver at his on-track place (2019 Japan, 2024 Belgium). Each entry is copied from the f1.com results
//      page for that race and is the whole truth for it: the order, and which drivers carry a label.

export type F1ResultLabel = "Ret" | "DSQ" | "NC" | "DNS";

/** Drivers ESPN lists in a Race only because they drove on Friday (startOrder 0, no order): they are not in the race. */
export const F1_PRACTICE_ONLY_STATUS = "STATUS_FREE_PRACTICE";

/** The status ESPN never gives a driver who did not start; scripts/lib/f1-weekend.ts stores it for the rows f1.com lists that ESPN omits. */
export const F1_DID_NOT_START_STATUS = "STATUS_DID_NOT_START";

interface RaceOverride {
  /** Every driver of the race (ESPN athlete id) in f1.com's order. */
  order: string[];
  /** The drivers f1.com prints a label for instead of a position (DNF -> Ret, DNS, DQ -> DSQ). Anyone else in `order` has a position. */
  labels: Record<string, F1ResultLabel>;
}

// Where f1.com lists a driver that ESPN does not (2023 Qatar: Sainz did not start), the row is added to the stored results
// (scripts/lib/f1-weekend.ts addF1DidNotStartRows). f1.com also lists no driver who did not start at 2021 Abu Dhabi,
// 2022 Saudi Arabia or 2023 Singapore, so nothing is added there.
export const F1_RACE_OVERRIDES: Record<string, RaceOverride> = {
  // 2019 Monaco Grand Prix, ESPN event 23465: f1.com results page, round 6 of 2019.
  "23465": {
    order: [
      "868", // 1 Hamilton
      "864", // 2 Vettel
      "4520", // 3 Bottas
      "4665", // 4 Verstappen
      "5501", // 5 Gasly
      "4686", // 6 Sainz
      "4624", // 7 Kvyat
      "5592", // 8 Albon
      "4510", // 9 Ricciardo
      "4374", // 10 Grosjean
      "5579", // 11 Norris
      "4472", // 12 Pérez
      "4396", // 13 Hülkenberg
      "4623", // 14 Magnussen
      "5503", // 15 Russell
      "4775", // 16 Stroll
      "337", // 17 Raikkonen
      "836", // 18 Kubica
      "5499", // 19 Giovinazzi
      "5498", // 20 Leclerc (Ret)
    ],
    labels: {
      "5498": "Ret", // Leclerc
    },
  },
  // 2019 Japanese Grand Prix, ESPN event 23476: f1.com results page, round 17 of 2019.
  "23476": {
    order: [
      "4520", // 1 Bottas
      "864", // 2 Vettel
      "868", // 3 Hamilton
      "5592", // 4 Albon
      "4686", // 5 Sainz
      "4510", // 6 Ricciardo (DSQ)
      "5498", // 7 Leclerc
      "5501", // 8 Gasly
      "4472", // 9 Pérez
      "4396", // 10 Hülkenberg (DSQ)
      "4775", // 11 Stroll
      "4624", // 12 Kvyat
      "5579", // 13 Norris
      "337", // 14 Raikkonen
      "4374", // 15 Grosjean
      "5499", // 16 Giovinazzi
      "4623", // 17 Magnussen
      "5503", // 18 Russell
      "836", // 19 Kubica
      "4665", // 20 Verstappen (Ret)
    ],
    labels: {
      "4510": "DSQ", // Ricciardo
      "4396": "DSQ", // Hülkenberg
      "4665": "Ret", // Verstappen
    },
  },
  // 2020 Russian Grand Prix, ESPN event 28132: f1.com results page, round 10 of 2020.
  "28132": {
    order: [
      "4520", // 1 Bottas
      "4665", // 2 Verstappen
      "868", // 3 Hamilton
      "4472", // 4 Pérez
      "4510", // 5 Ricciardo
      "5498", // 6 Leclerc
      "4678", // 7 Ocon
      "4624", // 8 Kvyat
      "5501", // 9 Gasly
      "5592", // 10 Albon
      "5499", // 11 Giovinazzi
      "4623", // 12 Magnussen
      "864", // 13 Vettel
      "337", // 14 Raikkonen
      "5579", // 15 Norris
      "4733", // 16 Latifi
      "4374", // 17 Grosjean
      "5503", // 18 Russell
      "4686", // 19 Sainz (Ret)
      "4775", // 20 Stroll (Ret)
    ],
    labels: {
      "4686": "Ret", // Sainz
      "4775": "Ret", // Stroll
    },
  },
  // 2021 Monaco Grand Prix, ESPN event 600001760: f1.com results page, round 5 of 2021.
  "600001760": {
    order: [
      "4665", // 1 Verstappen
      "4686", // 2 Sainz
      "5579", // 3 Norris
      "4472", // 4 Pérez
      "864", // 5 Vettel
      "5501", // 6 Gasly
      "868", // 7 Hamilton
      "4775", // 8 Stroll
      "4678", // 9 Ocon
      "5499", // 10 Giovinazzi
      "337", // 11 Raikkonen
      "4510", // 12 Ricciardo
      "348", // 13 Alonso
      "5503", // 14 Russell
      "4733", // 15 Latifi
      "5652", // 16 Tsunoda
      "5653", // 17 Mazepin
      "5654", // 18 Schumacher
      "4520", // 19 Bottas (Ret)
      "5498", // 20 Leclerc (DNS)
    ],
    labels: {
      "4520": "Ret", // Bottas
      "5498": "DNS", // Leclerc
    },
  },
  // 2021 Styrian Grand Prix (ESPN: Austrian), ESPN event 600006840: f1.com results page, round 8 of 2021.
  "600006840": {
    order: [
      "4665", // 1 Verstappen
      "868", // 2 Hamilton
      "4520", // 3 Bottas
      "4472", // 4 Pérez
      "5579", // 5 Norris
      "4686", // 6 Sainz
      "5498", // 7 Leclerc
      "4775", // 8 Stroll
      "348", // 9 Alonso
      "5652", // 10 Tsunoda
      "337", // 11 Raikkonen
      "864", // 12 Vettel
      "4510", // 13 Ricciardo
      "4678", // 14 Ocon
      "5499", // 15 Giovinazzi
      "5654", // 16 Schumacher
      "4733", // 17 Latifi
      "5653", // 18 Mazepin
      "5503", // 19 Russell (Ret)
      "5501", // 20 Gasly (Ret)
    ],
    labels: {
      "5503": "Ret", // Russell
      "5501": "Ret", // Gasly
    },
  },
  // 2021 Belgian Grand Prix, ESPN event 600001767: f1.com results page, round 12 of 2021.
  "600001767": {
    order: [
      "4665", // 1 Verstappen
      "5503", // 2 Russell
      "868", // 3 Hamilton
      "4510", // 4 Ricciardo
      "864", // 5 Vettel
      "5501", // 6 Gasly
      "4678", // 7 Ocon
      "5498", // 8 Leclerc
      "4733", // 9 Latifi
      "4686", // 10 Sainz
      "348", // 11 Alonso
      "4520", // 12 Bottas
      "5499", // 13 Giovinazzi
      "5579", // 14 Norris
      "5652", // 15 Tsunoda
      "5654", // 16 Schumacher
      "5653", // 17 Mazepin
      "337", // 18 Raikkonen
      "4472", // 19 Pérez
      "4775", // 20 Stroll
    ],
    labels: {},
  },
  // 2021 Sao Paulo Grand Prix, ESPN event 600001775: f1.com results page, round 19 of 2021.
  "600001775": {
    order: [
      "868", // 1 Hamilton
      "4665", // 2 Verstappen
      "4520", // 3 Bottas
      "4472", // 4 Pérez
      "5498", // 5 Leclerc
      "4686", // 6 Sainz
      "5501", // 7 Gasly
      "4678", // 8 Ocon
      "348", // 9 Alonso
      "5579", // 10 Norris
      "864", // 11 Vettel
      "337", // 12 Raikkonen
      "5503", // 13 Russell
      "5499", // 14 Giovinazzi
      "5652", // 15 Tsunoda
      "4733", // 16 Latifi
      "5653", // 17 Mazepin
      "5654", // 18 Schumacher
      "4510", // 19 Ricciardo (Ret)
      "4775", // 20 Stroll (Ret)
    ],
    labels: {
      "4510": "Ret", // Ricciardo
      "4775": "Ret", // Stroll
    },
  },
  // 2021 Saudi Arabian Grand Prix, ESPN event 600001777: f1.com results page, round 21 of 2021.
  "600001777": {
    order: [
      "868", // 1 Hamilton
      "4665", // 2 Verstappen
      "4520", // 3 Bottas
      "4678", // 4 Ocon
      "4510", // 5 Ricciardo
      "5501", // 6 Gasly
      "5498", // 7 Leclerc
      "4686", // 8 Sainz
      "5499", // 9 Giovinazzi
      "5579", // 10 Norris
      "4775", // 11 Stroll
      "4733", // 12 Latifi
      "348", // 13 Alonso
      "5652", // 14 Tsunoda
      "337", // 15 Raikkonen
      "864", // 16 Vettel (Ret)
      "4472", // 17 Pérez (Ret)
      "5653", // 18 Mazepin (Ret)
      "5503", // 19 Russell (Ret)
      "5654", // 20 Schumacher (Ret)
    ],
    labels: {
      "864": "Ret", // Vettel
      "4472": "Ret", // Pérez
      "5653": "Ret", // Mazepin
      "5503": "Ret", // Russell
      "5654": "Ret", // Schumacher
    },
  },
  // 2021 Abu Dhabi Grand Prix, ESPN event 600001776: f1.com results page, round 22 of 2021.
  "600001776": {
    order: [
      "4665", // 1 Verstappen
      "868", // 2 Hamilton
      "4686", // 3 Sainz
      "5652", // 4 Tsunoda
      "5501", // 5 Gasly
      "4520", // 6 Bottas
      "5579", // 7 Norris
      "348", // 8 Alonso
      "4678", // 9 Ocon
      "5498", // 10 Leclerc
      "864", // 11 Vettel
      "4510", // 12 Ricciardo
      "4775", // 13 Stroll
      "5654", // 14 Schumacher
      "4472", // 15 Pérez
      "4733", // 16 Latifi (Ret)
      "5499", // 17 Giovinazzi (Ret)
      "5503", // 18 Russell (Ret)
      "337", // 19 Raikkonen (Ret)
    ],
    labels: {
      "4733": "Ret", // Latifi
      "5499": "Ret", // Giovinazzi
      "5503": "Ret", // Russell
      "337": "Ret", // Raikkonen
    },
  },
  // 2022 Saudi Arabian Grand Prix, ESPN event 600014128: f1.com results page, round 2 of 2022.
  "600014128": {
    order: [
      "4665", // 1 Verstappen
      "5498", // 2 Leclerc
      "4686", // 3 Sainz
      "4472", // 4 Pérez
      "5503", // 5 Russell
      "4678", // 6 Ocon
      "5579", // 7 Norris
      "5501", // 8 Gasly
      "4623", // 9 Magnussen
      "868", // 10 Hamilton
      "5682", // 11 Guanyu
      "4396", // 12 Hülkenberg
      "4775", // 13 Stroll
      "5592", // 14 Albon
      "4520", // 15 Bottas (Ret)
      "348", // 16 Alonso (Ret)
      "4510", // 17 Ricciardo (Ret)
      "4733", // 18 Latifi (Ret)
      "5652", // 19 Tsunoda (DNS)
    ],
    labels: {
      "4520": "Ret", // Bottas
      "348": "Ret", // Alonso
      "4510": "Ret", // Ricciardo
      "4733": "Ret", // Latifi
      "5652": "DNS", // Tsunoda
    },
  },
  // 2022 Japanese Grand Prix, ESPN event 600014145: f1.com results page, round 18 of 2022.
  "600014145": {
    order: [
      "4665", // 1 Verstappen
      "4472", // 2 Pérez
      "5498", // 3 Leclerc
      "4678", // 4 Ocon
      "868", // 5 Hamilton
      "864", // 6 Vettel
      "348", // 7 Alonso
      "5503", // 8 Russell
      "4733", // 9 Latifi
      "5579", // 10 Norris
      "4510", // 11 Ricciardo
      "4775", // 12 Stroll
      "5652", // 13 Tsunoda
      "4623", // 14 Magnussen
      "4520", // 15 Bottas
      "5682", // 16 Guanyu
      "5654", // 17 Schumacher
      "5501", // 18 Gasly
      "4686", // 19 Sainz (Ret)
      "5592", // 20 Albon (Ret)
    ],
    labels: {
      "4686": "Ret", // Sainz
      "5592": "Ret", // Albon
    },
  },
  // 2022 Sao Paulo Grand Prix, ESPN event 600014148: f1.com results page, round 21 of 2022.
  "600014148": {
    order: [
      "5503", // 1 Russell
      "868", // 2 Hamilton
      "4686", // 3 Sainz
      "5498", // 4 Leclerc
      "348", // 5 Alonso
      "4665", // 6 Verstappen
      "4472", // 7 Pérez
      "4678", // 8 Ocon
      "4520", // 9 Bottas
      "4775", // 10 Stroll
      "864", // 11 Vettel
      "5682", // 12 Guanyu
      "5654", // 13 Schumacher
      "5501", // 14 Gasly
      "5592", // 15 Albon
      "4733", // 16 Latifi
      "5652", // 17 Tsunoda
      "5579", // 18 Norris (Ret)
      "4623", // 19 Magnussen (Ret)
      "4510", // 20 Ricciardo (Ret)
    ],
    labels: {
      "5579": "Ret", // Norris
      "4623": "Ret", // Magnussen
      "4510": "Ret", // Ricciardo
    },
  },
  // 2023 Singapore Grand Prix, ESPN event 600026763: f1.com results page, round 15 of 2023.
  "600026763": {
    order: [
      "4686", // 1 Sainz
      "5579", // 2 Norris
      "868", // 3 Hamilton
      "5498", // 4 Leclerc
      "4665", // 5 Verstappen
      "5501", // 6 Gasly
      "5752", // 7 Piastri
      "4472", // 8 Pérez
      "5741", // 9 Lawson
      "4623", // 10 Magnussen
      "5592", // 11 Albon
      "5682", // 12 Guanyu
      "4396", // 13 Hülkenberg
      "5745", // 14 Sargeant
      "348", // 15 Alonso
      "5503", // 16 Russell
      "4520", // 17 Bottas (Ret)
      "4678", // 18 Ocon (Ret)
      "5652", // 19 Tsunoda (Ret)
    ],
    labels: {
      "4520": "Ret", // Bottas
      "4678": "Ret", // Ocon
      "5652": "Ret", // Tsunoda
    },
  },
  // 2023 Qatar Grand Prix, ESPN event 600026765: f1.com results page, round 17 of 2023.
  "600026765": {
    order: [
      "4665", // 1 Verstappen
      "5752", // 2 Piastri
      "5579", // 3 Norris
      "5503", // 4 Russell
      "5498", // 5 Leclerc
      "348", // 6 Alonso
      "4678", // 7 Ocon
      "4520", // 8 Bottas
      "5682", // 9 Guanyu
      "4472", // 10 Pérez
      "4775", // 11 Stroll
      "5501", // 12 Gasly
      "5592", // 13 Albon
      "4623", // 14 Magnussen
      "5652", // 15 Tsunoda
      "4396", // 16 Hülkenberg
      "5741", // 17 Lawson
      "5745", // 18 Sargeant (Ret)
      "868", // 19 Hamilton (Ret)
      "4686", // 20 Sainz (DNS)
    ],
    labels: {
      "5745": "Ret", // Sargeant
      "868": "Ret", // Hamilton
      "4686": "DNS", // Sainz
    },
  },
  // 2023 Sao Paulo Grand Prix, ESPN event 600026788: f1.com results page, round 20 of 2023.
  "600026788": {
    order: [
      "4665", // 1 Verstappen
      "5579", // 2 Norris
      "348", // 3 Alonso
      "4472", // 4 Pérez
      "4775", // 5 Stroll
      "4686", // 6 Sainz
      "5501", // 7 Gasly
      "868", // 8 Hamilton
      "5652", // 9 Tsunoda
      "4678", // 10 Ocon
      "5745", // 11 Sargeant
      "4396", // 12 Hülkenberg
      "4510", // 13 Ricciardo
      "5752", // 14 Piastri
      "5503", // 15 Russell (Ret)
      "4520", // 16 Bottas (Ret)
      "5682", // 17 Guanyu (Ret)
      "4623", // 18 Magnussen (Ret)
      "5592", // 19 Albon (Ret)
      "5498", // 20 Leclerc (DNS)
    ],
    labels: {
      "5503": "Ret", // Russell
      "4520": "Ret", // Bottas
      "5682": "Ret", // Guanyu
      "4623": "Ret", // Magnussen
      "5592": "Ret", // Albon
      "5498": "DNS", // Leclerc
    },
  },
  // 2024 Belgian Grand Prix, ESPN event 600041146: f1.com results page, round 14 of 2024.
  "600041146": {
    order: [
      "5503", // 1 Russell (DSQ)
      "868", // 2 Hamilton
      "5752", // 3 Piastri
      "5498", // 4 Leclerc
      "4665", // 5 Verstappen
      "5579", // 6 Norris
      "4686", // 7 Sainz
      "4472", // 8 Pérez
      "348", // 9 Alonso
      "4678", // 10 Ocon
      "4510", // 11 Ricciardo
      "4775", // 12 Stroll
      "5592", // 13 Albon
      "5501", // 14 Gasly
      "4623", // 15 Magnussen
      "4520", // 16 Bottas
      "5652", // 17 Tsunoda
      "5745", // 18 Sargeant
      "4396", // 19 Hülkenberg
      "5682", // 20 Guanyu (Ret)
    ],
    labels: {
      "5503": "DSQ", // Russell
      "5682": "Ret", // Guanyu
    },
  },
};

const LABEL_MEANING: Record<F1ResultLabel, string> = { Ret: "retired", DSQ: "disqualified", NC: "not classified", DNS: "did not start" };

/** The key under a results table for the labels it uses ("Ret retired · DSQ disqualified"), or null when it uses none. */
export function f1LabelKey(labels: (F1ResultLabel | null)[]): string | null {
  const used = (Object.keys(LABEL_MEANING) as F1ResultLabel[]).filter((label) => labels.includes(label));
  return used.length ? used.map((label) => `${label} ${LABEL_MEANING[label]}`).join(" · ") : null;
}

/**
 * Where a driver's laps stand against the classification line: 90% of the winner's laps. ESPN's lapsCompleted for a driver who
 * stopped runs at or above the FIA's figure, by a lap or two in some races (2021 Bahrain: Gasly 53, the FIA 52; 2021 Brazil:
 * Stroll 49, the FIA 47) and by 3 to 5 in 2017 (Australia: Alonso 54, the FIA 50), and the winner's may be a lap out. So a driver
 * is only `below` the line when he is a lap under it even if his laps and the winner's were each a lap out, and only
 * `classified` when he is over it even if ESPN's figure for him is 5 laps too high. Anything closer is `unsure`, and `unknown`
 * is a driver or winner with no laps stored. The FIA's rounding of the line is not applied consistently by f1.com/Jolpica either
 * (2018 Monaco: 70 of 78 laps is not classified, 2016 Austria: 63 of 71 is), so a driver near the line is neither labelled
 * nor given a number ESPN did not give: he shows what ESPN said, as before.
 */
export type F1DistanceZone = "below" | "classified" | "unsure" | "unknown";

const ESPN_LAPS_MAY_BE_HIGH_BY = 5;

export function f1DistanceZone(laps: number | null | undefined, winnerLaps: number | null | undefined): F1DistanceZone {
  if (laps == null || winnerLaps == null || winnerLaps <= 0) return "unknown";
  if (laps + 1 < 0.9 * (winnerLaps - 1)) return "below";
  if (laps - ESPN_LAPS_MAY_BE_HIGH_BY >= 0.9 * (winnerLaps + 1)) return "classified";
  return "unsure";
}

/**
 * The label a stored status gives, outside the table. DSQ and DNS follow the status; Ret and NC need the driver to be clearly
 * under the classification line (`zone`), so a driver ESPN calls retired who was classified reads his number.
 */
export function f1StatusLabel(status: string | null | undefined, zone: F1DistanceZone = "unknown"): F1ResultLabel | null {
  if (status === "STATUS_DISQUALIFIED") return "DSQ";
  if (status === F1_DID_NOT_START_STATUS) return "DNS";
  if (zone !== "below") return null;
  if (status === "STATUS_RETIRED") return "Ret";
  if (status === "STATUS_NOT_CLASSIFIED") return "NC";
  return null;
}

/** The label of one driver's result in one race (Ret, DSQ, NC, DNS), or null when he has a position (and for a race that has no stored status yet). */
export function f1ResultLabel(eventId: string | null, driverId: string, status: string | null | undefined, zone: F1DistanceZone = "unknown"): F1ResultLabel | null {
  const override = eventId ? F1_RACE_OVERRIDES[eventId] : undefined;
  if (override && override.order.includes(driverId)) return override.labels[driverId] ?? null;
  return f1StatusLabel(status, zone);
}

/**
 * What one driver's result shows: his label, or his finishing position. In a race in the table above the position is his place
 * among the drivers without a label (f1.com does not count a disqualified driver), otherwise it is the position ESPN gave.
 * (orderF1Classification, which sees the whole session, also numbers the drivers ESPN gave no position.)
 */
export function f1ResultFor(eventId: string | null, driverId: string, position: number | null, status: string | null | undefined, zone: F1DistanceZone = "unknown"): { label: F1ResultLabel | null; position: number | null } {
  const override = eventId ? F1_RACE_OVERRIDES[eventId] : undefined;
  const at = override ? override.order.indexOf(driverId) : -1;
  if (override && at >= 0) {
    if (override.labels[driverId]) return { label: override.labels[driverId], position: null };
    return { label: null, position: 1 + override.order.slice(0, at).filter((id) => !override.labels[id]).length };
  }
  const label = f1StatusLabel(status, zone);
  return { label, position: label ? null : position };
}

export interface F1ClassifiedRow {
  driver_espn_id: string;
  position: number | null;
  status: string | null;
  laps: number | null;
  winner: boolean;
}

// The rule's four groups: drivers with a position, retired ones, ones who did not start, disqualified ones.
function groupOf(label: F1ResultLabel | null): number {
  if (label === "Ret" || label === "NC") return 1;
  if (label === "DNS") return 2;
  if (label === "DSQ") return 3;
  return 0;
}

/**
 * The rows of one Race or Sprint in classification order, each with `result_label` and `position` set as it is shown.
 * `rows` come in with ESPN's position and stored status/laps and may be in any order. `eventId` is the race's, for the
 * table above; pass null for a sprint, which has no table.
 *
 * Outside the table: drivers without a label come first in ESPN's order. A driver ESPN gave no position (2016-17 retirements)
 * who completed clearly over 90% of the winner's laps is classified: he follows the others by laps completed, then by driver
 * id (an approximation of f1.com's order among equal laps, which is by time), and is numbered after them. Where a label has
 * taken a driver out of the numbering, the numbers close up (f1.com does not count a disqualified driver).
 */
export function orderF1Classification<T extends F1ClassifiedRow>(eventId: string | null, rows: T[]): (T & { result_label: F1ResultLabel | null })[] {
  const override = eventId ? F1_RACE_OVERRIDES[eventId] : undefined;
  const winner = rows.find((r) => r.winner) ?? rows.find((r) => r.position === 1);
  const winnerLaps = winner?.laps ?? null;
  const decorated = rows.map((row) => {
    const zone = f1DistanceZone(row.laps, winnerLaps);
    const shown = f1ResultFor(eventId, row.driver_espn_id, row.position, row.status, zone);
    const listed = override ? override.order.indexOf(row.driver_espn_id) : -1;
    return { row, zone, shown, listed, group: groupOf(shown.label) };
  });
  decorated.sort((a, b) => {
    // A driver in the race's table goes where f1.com has him; the few ESPN rows the table does not name follow, in the rule's order.
    if (a.listed >= 0 || b.listed >= 0) {
      if (a.listed >= 0 && b.listed >= 0) return a.listed - b.listed;
      return a.listed >= 0 ? -1 : 1;
    }
    if (a.group !== b.group) return a.group - b.group;
    const aPosition = a.row.position ?? Infinity;
    const bPosition = b.row.position ?? Infinity;
    // retired drivers are ordered by laps first; the rest by ESPN's position, and by laps among those it gave none
    if (a.group === 1 || (aPosition === Infinity && bPosition === Infinity)) {
      const laps = (b.row.laps ?? -1) - (a.row.laps ?? -1);
      if (laps !== 0) return laps;
    }
    if (aPosition !== bPosition) return aPosition < bPosition ? -1 : 1;
    return a.row.driver_espn_id < b.row.driver_espn_id ? -1 : a.row.driver_espn_id > b.row.driver_espn_id ? 1 : 0;
  });

  // Numbers for the drivers without a label. A driver keeps ESPN's position unless a label has taken a driver above him out of the
  // numbering (f1.com does not count a disqualified driver), when the numbers close up; a classified driver ESPN gave no position
  // is numbered after the last one.
  const labelledAt = decorated.filter((d) => d.listed < 0 && d.shown.label !== null && d.row.position !== null).map((d) => d.row.position as number);
  let last = 0;
  return decorated.map((d) => {
    let position = d.shown.position;
    if (!override && d.shown.label === null) {
      if (d.row.position !== null) position = d.row.position - labelledAt.filter((p) => p < (d.row.position as number)).length;
      else if (d.zone === "classified") position = last + 1;
      if (position !== null) last = Math.max(last, position);
    }
    return { ...d.row, position, result_label: d.shown.label };
  });
}
