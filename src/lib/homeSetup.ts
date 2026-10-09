// A visitor's homepage setup: which blocks, in what order. There is no login, so it
// lives in this browser's localStorage, mirroring lib/follow.ts, and travels to another
// device as a base64url string in a link (encodeSetup / decodeSetup).
import { blockId, type HomeBlock } from "./blockTypes";
import { isBlockType, validateBlockParams } from "./blockParams";

export const SETUP_KEY = "sportsdb-home";
/** Fired on this tab whenever the stored setup changes ("storage" only fires in other tabs). */
export const SETUP_EVENT = "sportsdb:home-changed";
export const MAX_BLOCKS = 12;

export interface HomeSetup {
  v: 1;
  /** An edition key ("IN", "world", ...) or "blank" when the visitor started empty. */
  edition: string;
  country: string | null;
  blocks: HomeBlock[];
  createdAt: number;
  updatedAt: number;
}

/** Stored when the visitor chose "I'll decide later": the builder collapses to a bar. */
export interface Declined {
  v: 1;
  declined: true;
}

export type Stored = HomeSetup | Declined;

export function isSetup(s: Stored | null | undefined): s is HomeSetup {
  return !!s && !("declined" in s);
}

/** Validates a list of blocks from anywhere (storage, a link): known type, valid params, ids recomputed,
 * duplicates dropped, capped at MAX_BLOCKS. Null when the input is not a list at all. */
export function normaliseBlocks(input: unknown): HomeBlock[] | null {
  if (!Array.isArray(input)) return null;
  const out: HomeBlock[] = [];
  const seen = new Set<string>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const { type, params, label } = item as { type?: unknown; params?: unknown; label?: unknown };
    // "moments" is built from the team blocks and the last visit on every load: it is not something to save or share.
    if (typeof type !== "string" || !isBlockType(type) || type === "moments") continue;
    if (!params || typeof params !== "object") continue;
    const raw = Object.fromEntries(Object.entries(params as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v : undefined]));
    const check = validateBlockParams(type, raw);
    if (!check.ok) continue;
    const id = blockId(type, check.params);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, type, params: check.params, label: typeof label === "string" && label.trim() ? label.trim().slice(0, 80) : type });
    if (out.length === MAX_BLOCKS) break;
  }
  return out;
}

function asSetup(value: unknown): HomeSetup | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<HomeSetup>;
  if (v.v !== 1) return null;
  const blocks = normaliseBlocks(v.blocks);
  if (!blocks || blocks.length === 0) return null;
  const now = Date.now();
  return {
    v: 1,
    edition: typeof v.edition === "string" ? v.edition : "world",
    country: typeof v.country === "string" ? v.country : null,
    blocks,
    createdAt: typeof v.createdAt === "number" ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : now,
  };
}

export function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value && typeof value === "object" && (value as Declined).v === 1 && (value as Declined).declined === true) return { v: 1, declined: true };
  return asSetup(value);
}

export function newSetup(edition: string, country: string | null, blocks: HomeBlock[]): HomeSetup {
  const now = Date.now();
  return { v: 1, edition, country, blocks: normaliseBlocks(blocks) ?? [], createdAt: now, updatedAt: now };
}

// --- browser storage -----------------------------------------------------------

export function readSetup(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    return parseStored(window.localStorage.getItem(SETUP_KEY));
  } catch {
    return null;
  }
}

function store(value: Stored): boolean {
  if (typeof window === "undefined") return false;
  let saved = false;
  try {
    window.localStorage.setItem(SETUP_KEY, JSON.stringify(value));
    saved = true;
  } catch {
    /* private mode or quota: the built state lives in memory for this session */
  }
  applyHomeAttribute(value);
  window.dispatchEvent(new Event(SETUP_EVENT));
  return saved;
}

export function writeSetup(setup: HomeSetup): boolean {
  return store({ ...setup, blocks: normaliseBlocks(setup.blocks) ?? [], updatedAt: Date.now() });
}

export function writeDeclined(): boolean {
  return store({ v: 1, declined: true });
}

export function clearSetup() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SETUP_KEY);
  } catch {}
  applyHomeAttribute(null);
  window.dispatchEvent(new Event(SETUP_EVENT));
}

/** How many rows the built page's block grid will fill at this viewport width (1 column under 768px, 2 from
 * md, 3 from xl; the live block spans two columns from md; the "Add another block" button takes a slot).
 * `--hb-rows` feeds the min-height that keeps the footer from jumping while the blocks mount
 * (`.home-page` in globals.css). The pre-paint script in app/layout.tsx repeats this arithmetic. */
export function gridRows(blockTypes: readonly string[], width: number): number {
  const cols = width >= 1280 ? 3 : width >= 768 ? 2 : 1;
  const slots = blockTypes.length + 1 + (cols > 1 && blockTypes.includes("live") ? 1 : 0);
  return Math.ceil(slots / cols);
}

/** Mirrors the pre-paint script in app/layout.tsx: `data-home` on <html> drives which hero is visible. */
export function applyHomeAttribute(stored: Stored | null) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (!stored) delete el.dataset.home;
  else el.dataset.home = isSetup(stored) ? "built" : "collapsed";
  if (!el.style || typeof window === "undefined") return;
  if (isSetup(stored)) el.style.setProperty("--hb-rows", String(gridRows(stored.blocks.map((b) => b.type), window.innerWidth)));
  else el.style.removeProperty("--hb-rows");
}

// --- transfer link ---------------------------------------------------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
    const bin = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

/** The setup without its dates, as a URL-safe string for `/?setup=`. */
export function encodeSetup(setup: HomeSetup): string {
  const { v, edition, country, blocks } = setup;
  return toBase64Url(JSON.stringify({ v, edition, country, blocks: blocks.map(({ type, params, label }) => ({ type, params, label })) }));
}

/** Null for anything that is not a valid setup of 1 to MAX_BLOCKS blocks. */
export function decodeSetup(encoded: string): HomeSetup | null {
  const text = fromBase64Url(encoded);
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value && typeof value === "object" && Array.isArray((value as { blocks?: unknown }).blocks) && (value as { blocks: unknown[] }).blocks.length > MAX_BLOCKS) return null;
  return asSetup(value);
}

// --- pure list edits ---------------------------------------------------------------

export function hasBlock(setup: HomeSetup, id: string): boolean {
  return setup.blocks.some((b) => b.id === id);
}

/** The same setup object when the block is already there or the list is full. */
export function addBlock(setup: HomeSetup, block: HomeBlock): HomeSetup {
  if (hasBlock(setup, block.id) || setup.blocks.length >= MAX_BLOCKS) return setup;
  return { ...setup, blocks: [...setup.blocks, block] };
}

export function removeBlock(setup: HomeSetup, id: string): HomeSetup {
  return { ...setup, blocks: setup.blocks.filter((b) => b.id !== id) };
}

/** Moves a block one place up (-1) or down (+1); the same object at the ends. */
export function moveBlock(setup: HomeSetup, id: string, delta: -1 | 1): HomeSetup {
  const i = setup.blocks.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= setup.blocks.length) return setup;
  const blocks = [...setup.blocks];
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  return { ...setup, blocks };
}

/** Puts the listed ids first in that order; blocks not listed keep their relative order after them. */
export function reorderBlocks(setup: HomeSetup, ids: string[]): HomeSetup {
  const byId = new Map(setup.blocks.map((b) => [b.id, b]));
  const head = ids.map((id) => byId.get(id)).filter((b): b is HomeBlock => !!b);
  const tail = setup.blocks.filter((b) => !ids.includes(b.id));
  return { ...setup, blocks: [...head, ...tail] };
}
