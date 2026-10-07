// Search text handling shared by the query and its tests: a query is matched word by word, ignoring case and accents,
// so "mbappe" finds Mbappé, "james lebron" finds LeBron James and "man city" finds Manchester City.

// Letters the database can fold to plain ones with translate(); built as two equal-length strings so the pairs never drift.
const FOLD_PAIRS: [string, string][] = [
  ["àáâãäåāăąǎ", "a"], ["çćčĉċ", "c"], ["ďđð", "d"], ["èéêëēĕėęě", "e"], ["ĝğġģ", "g"], ["ĥħ", "h"],
  ["ìíîïĩīĭįı", "i"], ["ĵ", "j"], ["ķ", "k"], ["ĺļľŀł", "l"], ["ñńņň", "n"], ["òóôõöøōŏőǒ", "o"],
  ["ŕŗř", "r"], ["śŝşšș", "s"], ["ţťțŧ", "t"], ["ùúûüũūŭůűųǔ", "u"], ["ŵ", "w"], ["ýÿŷ", "y"], ["źżž", "z"],
];
const FROM = FOLD_PAIRS.map(([chars]) => chars).join("");
const TO = FOLD_PAIRS.map(([chars, plain]) => plain.repeat([...chars].length)).join("");

/**
 * SQL that lower-cases a column and folds its accents, to compare with a term made by `foldText`. A value whose bytes equal its
 * characters is plain ASCII, where lower-casing is the whole job: translate() on every row of a large table is what costs.
 */
export function foldSql(column: string): string {
  return `(case when octet_length(${column}) = char_length(${column}) then lower(${column}) else translate(lower(${column}), '${FROM}', '${TO}') end)`;
}

/** The same folding in code: lower case, plain letters. */
export function foldText(text: string): string {
  const lower = text.toLowerCase();
  let out = "";
  for (const ch of lower) {
    const at = FROM.indexOf(ch);
    out += at >= 0 ? TO[[...FROM].indexOf(ch)] : ch;
  }
  // Letters that decompose (any left over) lose their marks too.
  return out.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Words that join two teams in a typed fixture ("lakers vs celtics") and say nothing about a name.
const JOINERS = new Set(["vs", "v", "v.", "vs.", "versus", "at", "@", "x", "-", "–"]);

/** The words of a query, folded, joiners dropped; at most six so a pasted paragraph cannot build a huge query. */
export function searchTokens(query: string): string[] {
  return foldText(query).split(/\s+/).map((t) => t.replace(/[.,]+$/g, "")).filter((t) => t && !JOINERS.has(t)).slice(0, 6);
}

/** A term as a LIKE pattern that matches it literally. */
export function likeTerm(token: string): string {
  return `%${token.replace(/[\\%_]/g, "\\$&")}%`;
}
