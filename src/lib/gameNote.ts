// The label an NBA Cup game carries where a round would show. ESPN files the Cup's group games, quarterfinals and
// semifinals as ordinary regular-season games (season type 2, competition type STD), so the only thing that says
// they belong to the Cup is the event note ("NBA Cup - Group Play", "NBA Cup - Semifinals"); the scraper keeps it
// in games.note. The Cup final has its own competition type (CC) and is labelled from that (specialStageLabel in
// stage.ts), so it is left to it here.

const COMPETITION_TYPE_CUP_FINAL = "CC";

/**
 * "NBA Cup · Group play", "NBA Cup quarterfinal" or "NBA Cup semifinal" from a game's stored note; null for any
 * other note (a makeup date, an international game's billing), for no note, and for the final. The 2023-24
 * edition was the In-Season Tournament, and its games keep that name.
 */
export function cupNoteLabel(g: { note?: string | null; competition_type?: string | null }): string | null {
  if (g.competition_type === COMPETITION_TYPE_CUP_FINAL) return null;
  const note = g.note ?? "";
  const name = /in-season tournament/i.test(note) ? "In-Season Tournament" : /\bnba cup\b/i.test(note) ? "NBA Cup" : null;
  if (!name) return null;
  if (/group play/i.test(note)) return `${name} · Group play`;
  if (/quarter[\s-]?finals?/i.test(note)) return `${name} quarterfinal`;
  if (/semi[\s-]?finals?/i.test(note)) return `${name} semifinal`;
  return null;
}
