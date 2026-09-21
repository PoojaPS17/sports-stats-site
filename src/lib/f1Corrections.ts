// Where ESPN's own standings feed disagrees with the FIA's final classification, the FIA's figure is shown.
// Each entry names the season, the ESPN id of the driver (athlete id) or constructor (manufacturer id), and only the
// fields that change. Applied at read time (getF1DriverStandings / getF1ConstructorStandings), so the stored feed
// stays as ESPN sent it and a re-run of fetch:f1-standings does not undo a correction. The standings page says so.
//
// Checked against the FIA World Championship final classifications (fia.com, Formula 1 championship standings for the
// season) and against the Jolpica/Ergast archive, which carries the same figures.

export interface F1StandingsCorrection {
  season: number;
  type: "driver" | "constructor";
  /** ESPN athlete id (driver) or manufacturer id (constructor). */
  id: string;
  position?: number;
  points?: number;
  wins?: number;
}

export const F1_STANDINGS_CORRECTIONS: F1StandingsCorrection[] = [
  // BUG-2. 2021 drivers' championship, FIA final classification: Max Verstappen 395.5 points (10 wins). ESPN lists 413.5.
  { season: 2021, type: "driver", id: "4665", points: 395.5 },
  // BUG-3. 2021 drivers' championship, FIA final classification: Robert Kubica 20th and Nikita Mazepin 21st (both 0 points;
  // Kubica scored in no Grand Prix but was classified ahead on the FIA table). ESPN has the two the other way round.
  { season: 2021, type: "driver", id: "836", position: 20 },
  { season: 2021, type: "driver", id: "5653", position: 21 },
  // BUG-4. 2020 drivers' championship, FIA final classification: George Russell 3 points (9th at the Sakhir Grand Prix). ESPN lists 2.
  { season: 2020, type: "driver", id: "5503", points: 3 },
  // BUG-4. 2019 drivers' championship, FIA final classification: Lewis Hamilton 413 points. ESPN lists 412.
  { season: 2019, type: "driver", id: "868", points: 413 },
  // BUG-4. 2020 constructors' championship, FIA final classification: Mercedes won 13 Grands Prix and Red Bull 2 (Racing Point
  // 1 and AlphaTauri 1 are right). ESPN's constructor "wins" stat says 6 and 1; its driver wins are correct.
  { season: 2020, type: "constructor", id: "106893", wins: 13 },
  { season: 2020, type: "constructor", id: "106921", wins: 2 },
];

/**
 * The rows of one standings table with the corrections for that season applied, in rank order again (a corrected rank
 * moves a row). Rows are matched by `idOf`; rows with no correction pass through unchanged.
 */
export function applyF1StandingsCorrections<T extends { position: number | null; points: number | null; wins: number | null }>(
  season: number,
  type: "driver" | "constructor",
  rows: T[],
  idOf: (row: T) => string
): T[] {
  const fixes = F1_STANDINGS_CORRECTIONS.filter((c) => c.season === season && c.type === type);
  if (fixes.length === 0) return rows;
  const fixed = rows.map((row) => {
    const fix = fixes.find((c) => c.id === idOf(row));
    return fix ? { ...row, position: fix.position ?? row.position, points: fix.points ?? row.points, wins: fix.wins ?? row.wins } : row;
  });
  return fixed.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
}
