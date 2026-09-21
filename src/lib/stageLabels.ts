// The two stage names the NBA feed's columns give a game that has no `round`, in one place so the game log
// (gameStage.stageLabel) and the score cards (stage.gameRoundLabel) can never name them differently. It imports
// nothing, so both of those can use it without a cycle.

/** "Play-In" for a play-in game (games.stage), "NBA Cup final" for the Cup final (games.competition_type CC); null otherwise. */
export function specialStageLabel(g: { stage?: string | null; competition_type?: string | null }): string | null {
  if (g.stage === "playin") return "Play-In";
  if (g.competition_type === "CC") return "NBA Cup final";
  return null;
}
