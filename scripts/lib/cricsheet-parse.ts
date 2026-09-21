// Pure parsing of a Cricsheet ball-by-ball match into the per-innings figures, the
// per-player match cards and the stored scorecard. No database access, so
// import-cricsheet.ts (which runs on import) and the tests can both load it.
import type { CricketPlayerMatchStats } from "./cricket-career";

/* ------------------------------------------------------------------------ */
/* Match parsing                                                             */
/* ------------------------------------------------------------------------ */

export interface BatterLine {
  id: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  order: number;
}
export interface BowlerLine {
  id: string;
  balls: number;
  maidens: number;
  conceded: number;
  wickets: number;
  order: number;
}
export interface Innings {
  team: string;
  runs: number;
  wickets: number;
  balls: number;
  allOut: boolean;
  target: { runs: number; overs: number } | null;
  /** Every delivery in the innings, wides and no-balls included. */
  deliveries: number;
  batters: BatterLine[];
  bowlers: BowlerLine[];
  catches: Map<string, number>;
}

// Dismissals the bowler is credited with.
const BOWLER_WICKETS = new Set(["bowled", "caught", "lbw", "stumped", "caught and bowled", "hit wicket"]);
// Ways of leaving the crease that do not count as a wicket in the total.
const NOT_A_WICKET = new Set(["retired hurt", "retired not out"]);

export function oversText(balls: number, ballsPerOver = 6): string {
  return `${Math.floor(balls / ballsPerOver)}.${balls % ballsPerOver}`;
}

export function parseInnings(raw: any, personId: (name: string) => string | null, ballsPerOver: number, playersInXI: number): Innings {
  const batters = new Map<string, BatterLine>();
  const bowlers = new Map<string, BowlerLine>();
  const catches = new Map<string, number>();
  let runs = 0;
  let wickets = 0;
  let balls = 0;
  let deliveries = 0;

  const batter = (name: string): BatterLine | null => {
    const id = personId(name);
    if (!id) return null;
    if (!batters.has(id)) batters.set(id, { id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, order: batters.size });
    return batters.get(id)!;
  };
  const bowler = (name: string): BowlerLine | null => {
    const id = personId(name);
    if (!id) return null;
    if (!bowlers.has(id)) bowlers.set(id, { id, balls: 0, maidens: 0, conceded: 0, wickets: 0, order: bowlers.size });
    return bowlers.get(id)!;
  };

  for (const over of raw.overs ?? []) {
    let overBowler: string | null = null;
    let overConceded = 0;
    let overLegalBalls = 0;
    let singleBowler = true;
    for (const d of over.deliveries ?? []) {
      const wides = d.extras?.wides ?? 0;
      const noballs = d.extras?.noballs ?? 0;
      const legal = wides === 0 && noballs === 0;
      runs += d.runs?.total ?? 0;
      deliveries++;
      if (legal) balls++;

      const bt = batter(d.batter);
      if (bt) {
        if (wides === 0) bt.balls++;
        bt.runs += d.runs?.batter ?? 0;
        if (!d.runs?.non_boundary) {
          if (d.runs?.batter === 4) bt.fours++;
          if (d.runs?.batter === 6) bt.sixes++;
        }
      }
      // The non-striker has come to the crease even if they never face a ball
      // (they can still be run out), so they belong on the card.
      batter(d.non_striker);

      const bw = bowler(d.bowler);
      if (bw) {
        if (overBowler === null) overBowler = bw.id;
        else if (overBowler !== bw.id) singleBowler = false;
        if (legal) {
          bw.balls++;
          overLegalBalls++;
        }
        const conceded = (d.runs?.batter ?? 0) + wides + noballs;
        bw.conceded += conceded;
        overConceded += conceded;
      }

      for (const w of d.wickets ?? []) {
        const kind: string = w.kind ?? "";
        if (NOT_A_WICKET.has(kind)) continue;
        wickets++;
        const out = batter(w.player_out);
        if (out) out.out = true;
        if (bw && BOWLER_WICKETS.has(kind)) bw.wickets++;
        if (kind === "caught and bowled" && bw) catches.set(bw.id, (catches.get(bw.id) ?? 0) + 1);
        if (kind === "caught" || kind === "stumped") {
          const f = (w.fielders ?? [])[0];
          if (f && !f.substitute && f.name) {
            const fid = personId(f.name);
            if (fid) catches.set(fid, (catches.get(fid) ?? 0) + 1);
          }
        }
      }
    }
    if (overBowler && singleBowler && overConceded === 0 && overLegalBalls === ballsPerOver) {
      bowlers.get(overBowler)!.maidens++;
    }
  }

  return {
    team: raw.team,
    runs,
    wickets,
    balls,
    allOut: wickets >= playersInXI - 1,
    target: raw.target ? { runs: raw.target.runs, overs: raw.target.overs } : null,
    deliveries,
    // Everyone who came to the crease, including a not-out non-striker who never faced a ball:
    // Cricinfo lists him as 0* (0) and counts an innings.
    batters: [...batters.values()].sort((a, b) => a.order - b.order),
    bowlers: [...bowlers.values()].sort((a, b) => a.order - b.order),
    catches,
  };
}

export interface ParsedMatch {
  id: string;
  date: string;
  seasonYear: number;
  teams: [string, string];
  venue: string | null;
  city: string | null;
  event: { name: string | null; stage: string | null };
  officials: { name: string; role: string }[];
  playerOfMatch: string[];
  innings: Innings[];
  hadSuperOver: boolean;
  outcome: any;
  maxOvers: number | null;
  ballsPerOver: number;
  /** Player Cricinfo id -> team name, for everyone in the XIs. */
  squads: Map<string, string>;
  names: Map<string, string>;
}

export function parseMatch(id: string, data: any, register: Map<string, string | null>): ParsedMatch | null {
  const info = data.info ?? {};
  if (!info.teams || info.teams.length !== 2 || !info.dates?.length) return null;
  const registry: Record<string, string> = info.registry?.people ?? {};
  const names = new Map<string, string>();
  const personId = (name: string | undefined): string | null => {
    if (!name) return null;
    const ident = registry[name];
    if (!ident) return null;
    const id = register.get(ident) || `cs-${ident}`;
    names.set(id, name);
    return id;
  };

  const squads = new Map<string, string>();
  for (const [team, list] of Object.entries<string[]>(info.players ?? {})) {
    for (const n of list) {
      const pid = personId(n);
      if (pid) squads.set(pid, team);
    }
  }
  const ballsPerOver: number = info.balls_per_over ?? 6;
  const xi = Math.max(...Object.values<string[]>(info.players ?? {}).map((l) => l.length), 11);

  const innings: Innings[] = [];
  let hadSuperOver = false;
  for (const raw of data.innings ?? []) {
    if (raw.super_over) {
      hadSuperOver = true;
      continue;
    }
    innings.push(parseInnings(raw, personId, ballsPerOver, xi));
  }

  const officials: { name: string; role: string }[] = [];
  const roles: [string, string][] = [
    ["umpires", "Umpire"],
    ["tv_umpires", "TV Umpire"],
    ["reserve_umpires", "Reserve Umpire"],
    ["match_referees", "Match Referee"],
  ];
  for (const [key, role] of roles) for (const n of info.officials?.[key] ?? []) officials.push({ name: n, role });

  return {
    id,
    date: info.dates[0],
    seasonYear: Number(info.dates[0].slice(0, 4)),
    teams: [info.teams[0], info.teams[1]],
    venue: info.venue ?? null,
    city: info.city ?? null,
    event: { name: info.event?.name ?? null, stage: info.event?.stage ?? null },
    officials,
    playerOfMatch: (info.player_of_match ?? []).map((n: string) => personId(n)).filter(Boolean) as string[],
    innings,
    hadSuperOver,
    outcome: info.outcome ?? {},
    maxOvers: typeof info.overs === "number" ? info.overs : null,
    ballsPerOver,
    squads,
    names,
  };
}

export function strikeRate(runs: number, balls: number): string {
  return balls > 0 ? ((runs / balls) * 100).toFixed(2) : "-";
}
export function economy(conceded: number, balls: number, ballsPerOver: number): string {
  return balls > 0 ? ((conceded / balls) * ballsPerOver).toFixed(2) : "-";
}

/* ------------------------------------------------------------------------ */
/* Stored figures                                                            */
/* ------------------------------------------------------------------------ */

// Per-player match figures in the shape backfill-cricket-player-stats stores. Everyone in
// info.players gets a card, empty if they did nothing: Cricinfo's Matches counts every
// name in it, an impact or concussion substitute included (so info.replacements is not
// consulted). Someone who is not in info.players has a card only from his figures.
export function buildCards(m: ParsedMatch, teamOf: (id: string) => string | null, nameOf: (id: string) => string): Map<string, CricketPlayerMatchStats> {
  const cards = new Map<string, CricketPlayerMatchStats>();
  // A match with no innings, or with no ball bowled, was abandoned before play: nobody
  // appeared in it (the ESPN extractor drops these too, see cricket-career.ts).
  if (m.innings.every((inn) => inn.deliveries === 0)) return cards;
  const card = (id: string) => {
    if (!cards.has(id)) cards.set(id, { athleteId: id, name: nameOf(id), teamId: teamOf(id) ?? "" });
    return cards.get(id)!;
  };
  for (const inn of m.innings) {
    for (const b of inn.batters) card(b.id).batting = { runs: b.runs, ballsFaced: b.balls, fours: b.fours, sixes: b.sixes, notOut: !b.out };
    for (const bw of inn.bowlers) card(bw.id).bowling = { overs: Number(oversText(bw.balls, m.ballsPerOver)), conceded: bw.conceded, wickets: bw.wickets };
    for (const [id, n] of inn.catches) card(id).catches = (card(id).catches ?? 0) + n;
  }
  for (const id of m.squads.keys()) card(id);
  return cards;
}

// The stored match report the match page renders (same document the ESPN scraper
// would produce), so no live ESPN call is needed for these leagues.
export function buildScorecard(m: ParsedMatch, team: (name: string) => { espn_id: string; name: string }, playerName: (id: string) => string) {
  return m.innings.map((inn) => {
    const battingTeam = team(inn.team);
    return {
      teamId: battingTeam.espn_id,
      teamName: battingTeam.name,
      battingLabels: ["R", "B", "4s", "6s", "SR"],
      battingRows: inn.batters.map((b) => ({
        athleteId: b.id,
        name: playerName(b.id),
        stats: [String(b.runs), String(b.balls), String(b.fours), String(b.sixes), strikeRate(b.runs, b.balls)],
      })),
      bowlingLabels: ["O", "M", "R", "W", "Econ"],
      bowlingRows: inn.bowlers.map((bw) => ({
        athleteId: bw.id,
        name: playerName(bw.id),
        stats: [oversText(bw.balls, m.ballsPerOver), String(bw.maidens), String(bw.conceded), String(bw.wickets), economy(bw.conceded, bw.balls, m.ballsPerOver)],
      })),
    };
  });
}
