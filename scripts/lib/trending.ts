import type { Pool } from "pg";
import { notPseudoAthleteSql } from "../../src/lib/pseudoAthlete";

export interface EntityMatch {
  league: string;
  type: "player" | "team";
  slug: string;
  name: string;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[.''"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Strips a Wikipedia-style disambiguation suffix, e.g. "Josh Allen (quarterback)" -> "josh allen".
function stripDisambiguation(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "");
}

export interface EntityIndex {
  byFullName: Map<string, EntityMatch>;
  teamNicknames: Map<string, EntityMatch>;
}

// Loads every tracked team and player into an in-memory lookup so the trending fetch
// scripts can check "is this Wikipedia article / video title / search term about
// someone we actually cover?" without a DB round-trip per candidate. Cheap enough to
// rebuild on every run — a few thousand rows, once per script invocation.
export async function loadEntityIndex(pool: Pool): Promise<EntityIndex> {
  const byFullName = new Map<string, EntityMatch>();
  const teamNicknames = new Map<string, EntityMatch>();
  // Mascot nicknames collide across sports far more than full team names do (NFL's
  // Detroit Lions vs. IPL's Gujarat Lions; IPL's Rajasthan Royals vs. any "Royals" in
  // another league) — tracked separately so a colliding nickname can be dropped
  // rather than silently resolved to whichever team happened to load first.
  const nicknameOwners = new Map<string, Set<string>>();

  const teams = await pool.query<{ league: string; slug: string; name: string }>("select league, slug, name from teams");
  for (const t of teams.rows) {
    const entity: EntityMatch = { league: t.league, type: "team", slug: t.slug, name: t.name };
    byFullName.set(normalize(t.name), entity);
    const words = t.name.trim().split(" ");
    const nickname = normalize(words[words.length - 1]);
    // Skip short/common last words ("FC", "SC", "XI") — too likely to false-positive.
    if (words[words.length - 1].length <= 3) continue;
    if (!teamNicknames.has(nickname)) teamNicknames.set(nickname, entity);
    if (!nicknameOwners.has(nickname)) nicknameOwners.set(nickname, new Set());
    nicknameOwners.get(nickname)!.add(`${t.league}:${t.slug}`);
  }
  for (const [nickname, owners] of nicknameOwners) {
    if (owners.size > 1) teamNicknames.delete(nickname);
  }

  const players = await pool.query<{ league: string; slug: string; name: string }>(
    `select p.league, p.slug, p.name from players p where ${notPseudoAthleteSql()}`
  );
  for (const p of players.rows) {
    const key = normalize(p.name);
    // First match wins on a name collision across leagues — an extra profile link
    // pointed at the "wrong" same-named player is a minor, rare inconvenience, not
    // worth a full disambiguation pass for a trending sidebar.
    if (!byFullName.has(key)) byFullName.set(key, { league: p.league, type: "player", slug: p.slug, name: p.name });
  }

  return { byFullName, teamNicknames };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches free text (a Wikipedia title, video title, or search phrase) against a
// tracked player or team: first an exact normalized match (fast path, covers the
// common case of a bare article title), then a substring/whole-word fallback for
// longer text that merely mentions the name.
// Some players are legitimately registered under a single name (a common convention
// in Brazilian/Portuguese football), but a bare one-word Wikipedia/search hit for a
// short, common first name ("Kevin", "Fred") is far more likely to be about the name
// in general than about one specific mononym player buried in our historical roster
// data. Requiring some length on a one-word match keeps genuine mononym stars
// ("Neymar", "Ronaldinho") while dropping that noise.
function isTrustworthyMatch(entity: EntityMatch, text: string): boolean {
  // National cricket sides are named after countries ("Canada", "Australia"). A
  // Wikipedia page or app called just "Canada" is about the country, so a one-word
  // team name only counts when the text itself mentions cricket.
  if (entity.type === "team" && !entity.name.includes(" ")) return /cricket/i.test(text);
  return entity.name.includes(" ") || entity.name.length >= 6;
}

export function matchEntity(text: string, index: EntityIndex): EntityMatch | null {
  const norm = normalize(stripDisambiguation(text));

  const exact = index.byFullName.get(norm);
  if (exact && isTrustworthyMatch(exact, text)) return exact;

  for (const [key, entity] of index.byFullName) {
    if (key.length > 3 && norm.includes(key) && isTrustworthyMatch(entity, text)) return entity;
  }
  for (const [nick, entity] of index.teamNicknames) {
    if (new RegExp(`\\b${escapeRegExp(nick)}\\b`).test(norm)) return entity;
  }
  return null;
}
