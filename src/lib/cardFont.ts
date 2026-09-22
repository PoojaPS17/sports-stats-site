import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read once at module scope (next/og docs: "The font doesn't depend on request
// data, so read it once at module scope") — assets/fonts holds two Latin +
// Latin Extended subsets of Inter (see docs/superpowers/specs/2026-09-20-
// player-performance-cards-design.md §6 for the diacritic acceptance names).
const regular = readFileSync(join(process.cwd(), "assets/fonts/Inter-Regular.ttf"));
const bold = readFileSync(join(process.cwd(), "assets/fonts/Inter-Bold.ttf"));

export const CARD_FONTS: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] = [
  { name: "Inter", data: regular, weight: 400, style: "normal" },
  { name: "Inter", data: bold, weight: 700, style: "normal" },
];
