// Plain-English names for the abbreviated stat codes the feed uses, shown as
// tooltips on box-score column headers, plus display fixes for values the feed
// sends as fractions ("0.4" for 40%).
export const STAT_GLOSSARY: Record<string, string> = {
  // Soccer
  APP: "Appearances",
  STRT: "Starts",
  SUBIN: "Substituted in",
  G: "Goals",
  A: "Assists",
  SHOT: "Shots",
  SOG: "Shots on goal",
  SHF: "Shots off target",
  FC: "Fouls committed",
  FA: "Fouls suffered",
  YC: "Yellow cards",
  RC: "Red cards",
  OG: "Own goals",
  OF: "Offsides",
  GA: "Goals against (goalkeeper)",
  SV: "Saves",
  // American football
  GP: "Games played",
  CMP: "Completions",
  ATT: "Attempts",
  "CMP%": "Completion percentage",
  YDS: "Yards",
  AVG: "Average",
  TD: "Touchdowns",
  INT: "Interceptions",
  LNG: "Longest",
  LONG: "Longest",
  SACK: "Sacks",
  RTG: "Passer rating",
  QBR: "Total QBR",
  CAR: "Carries",
  FD: "First downs",
  FUM: "Fumbles",
  LST: "Fumbles lost",
  REC: "Receptions",
  TGTS: "Targets",
  TOT: "Total tackles",
  SOLO: "Solo tackles",
  AST: "Assists",
  FF: "Forced fumbles",
  FR: "Fumble recoveries",
  PD: "Passes defended",
  STF: "Stuffs",
  KB: "Kicks blocked",
  "C/ATT": "Completions / attempts",
  // Basketball
  MIN: "Minutes",
  FG: "Field goals made-attempted",
  "FG%": "Field goal percentage",
  "3PT": "Three-pointers made-attempted",
  "3P%": "Three-point percentage",
  FT: "Free throws made-attempted",
  "FT%": "Free-throw percentage",
  OREB: "Offensive rebounds",
  DREB: "Defensive rebounds",
  OR: "Offensive rebounds",
  DR: "Defensive rebounds",
  REB: "Rebounds",
  STL: "Steals",
  BLK: "Blocks",
  TO: "Turnovers",
  PF: "Personal fouls",
  "+/-": "Plus / minus",
  PTS: "Points",
  DD2: "Double-doubles",
  TD3: "Triple-doubles",
};

export function statTitle(code: string): string | undefined {
  return STAT_GLOSSARY[code];
}

// The feed sends some percentage stats as a fraction with a "%" label ("On Target %"
// = "0.4"). Anything labelled as a percentage that is at most 1 is shown as a
// percentage; values above 1 are already percentages.
export function formatStat(label: string, value: string): string {
  if (!/%/.test(label)) return value;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return value;
  if (n <= 1) return `${Math.round(n * 100)}%`;
  return /%$/.test(String(value).trim()) ? value : `${value}%`;
}
