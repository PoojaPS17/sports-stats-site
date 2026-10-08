// The built homepage's hero copy, written from the visitor's own blocks: at most two facts
// in the headline and two in the line under it, each entity named once. Pure, so the
// priorities are tested; the component supplies the clock and the time formatting.
import { teamHex } from "./teamColor";
import type { BlockPayload, F1DriversBlockData, HomeBlock, LiveBlockData, PlayerFormBlockData, StandingsBlockData, TeamNextBlockData } from "./blockTypes";

export interface LoadedBlock {
  block: HomeBlock;
  data: BlockPayload | null;
}

export interface HeroLineOptions {
  now: Date;
  /** "19:00" or "7:00pm" in the visitor's zone. */
  formatTime(iso: string): string;
  /** "Sat" or "Saturday" in the visitor's zone. */
  formatDay(iso: string): string;
}

interface Fact {
  text: string;
  entity: string;
}

const live = (l: LoadedBlock): LiveBlockData | null => (l.block.type === "live" ? (l.data as LiveBlockData | null) : null);
const teamNext = (l: LoadedBlock): TeamNextBlockData | null => (l.block.type === "team-next" ? (l.data as TeamNextBlockData | null) : null);
const playerForm = (l: LoadedBlock): PlayerFormBlockData | null => (l.block.type === "player-form" ? (l.data as PlayerFormBlockData | null) : null);
const f1 = (l: LoadedBlock): F1DriversBlockData | null => (l.block.type === "f1-drivers" ? (l.data as F1DriversBlockData | null) : null);
const standings = (l: LoadedBlock): StandingsBlockData | null => (l.block.type === "standings" || l.block.type === "series-standings" ? (l.data as StandingsBlockData | null) : null);

export function liveCountOf(loaded: LoadedBlock[]): number {
  return loaded.reduce((n, l) => {
    const d = live(l);
    return n + (d ? d.games.length + d.cricket.length + d.tennis.length : 0);
  }, 0);
}

function sameDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Facts in priority order: the visitor's team in play, their player's last score, a fixture today,
 * the next race, a table leader. */
function facts(loaded: LoadedBlock[], o: HeroLineOptions): Fact[] {
  const out: Fact[] = [];
  for (const l of loaded) {
    const d = teamNext(l);
    const m = d?.next.find((f) => f.live);
    if (d && m) {
      const score = m.score ? ` ${m.score}` : "";
      const status = m.status ? `, ${m.status}` : "";
      out.push({ text: `${d.team.name}${score} v ${m.opponent}${status}.`, entity: d.team.name });
    }
  }
  for (const l of loaded) {
    const d = playerForm(l);
    const g = d?.games[0];
    if (d && g && g.display) out.push({ text: `${d.player.name} ${d.verb} ${g.display} last time out.`, entity: d.player.name });
  }
  for (const l of loaded) {
    const d = teamNext(l);
    const m = d?.next.find((f) => !f.live && !f.tbd && sameDay(f.date, o.now));
    if (d && m) out.push({ text: `${m.home ? `${d.team.name} v ${m.opponent}` : `${m.opponent} v ${d.team.name}`} at ${o.formatTime(m.date)}.`, entity: d.team.name });
  }
  for (const l of loaded) {
    const d = f1(l);
    if (d?.nextRace) out.push({ text: `${d.nextRace.name} ${o.formatDay(d.nextRace.raceIso)} ${o.formatTime(d.nextRace.raceIso)}.`, entity: d.nextRace.name });
  }
  for (const l of loaded) {
    const d = standings(l);
    const [first, second] = d?.rows ?? [];
    // Nobody leads a preseason table: its exhibition records seed no one.
    if (!d || !first || d.preseason) continue;
    if (d.record) out.push({ text: `${first.name} lead the ${d.label} at ${first.figure}.`, entity: first.name });
    else {
      const gap = second ? Number(first.figure) - Number(second.figure) : NaN;
      const by = Number.isFinite(gap) && gap > 0 ? ` by ${gap} point${gap === 1 ? "" : "s"}` : "";
      out.push({ text: `${first.name} lead the ${d.label}${by}.`, entity: first.name });
    }
  }
  return out;
}

export function heroLine(loaded: LoadedBlock[], o: HeroLineOptions): { headline: string; sub: string; liveCount: number } {
  const liveCount = liveCountOf(loaded);
  const used = new Set<string>();
  const picked: string[] = [];
  for (const f of facts(loaded, o)) {
    if (used.has(f.entity)) continue;
    used.add(f.entity);
    picked.push(f.text);
    if (picked.length === 4) break;
  }
  if (picked.length === 0) {
    const n = loaded.length;
    return { headline: `Your ${n} block${n === 1 ? "" : "s"}, ${liveCount} live.`, sub: "", liveCount };
  }
  return { headline: picked.slice(0, 2).join(" "), sub: picked.slice(2, 4).join(" "), liveCount };
}

/** The brand blue the hero glows with when the visitor follows no team that has a colour. */
export const HERO_FALLBACK_COLOUR = "#2563d9";

/** The two glow colours behind the hero: the first two different team colours among the visitor's team blocks,
 * in block order. One team gives the same colour twice; none give the brand blue. */
export function heroTeamColours(loaded: LoadedBlock[]): [string, string] {
  const found: string[] = [];
  for (const l of loaded) {
    const d = teamNext(l);
    if (!d?.team.color) continue;
    const hex = teamHex(d.team.color, "");
    if (hex && !found.includes(hex)) found.push(hex);
    if (found.length === 2) break;
  }
  const first = found[0] ?? HERO_FALLBACK_COLOUR;
  return [first, found[1] ?? first];
}
