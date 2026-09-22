import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read once at module scope (next/og docs: "The font doesn't depend on request
// data, so read it once at module scope") — assets/fonts holds two Inter
// weights (400/700) locally subsetted with the `subset-font` package (see
// scripts/subset-card-fonts note in tests/card-font.test.ts and the task-1
// fix report) to cover printable ASCII (U+0020-U+007E) plus the full Latin-1
// Supplement + Latin Extended-A Unicode block (U+00A0-U+017F). That block is
// a superset of the spec's diacritic acceptance names (see
// docs/superpowers/specs/2026-09-20-player-performance-cards-design.md §6),
// not a hand-picked character list.
const regular = readFileSync(join(process.cwd(), "assets/fonts/Inter-Regular.ttf"));
const bold = readFileSync(join(process.cwd(), "assets/fonts/Inter-Bold.ttf"));

export const CARD_FONTS: { name: string; data: Buffer; weight: 400 | 700; style: "normal" }[] = [
  { name: "Inter", data: regular, weight: 400, style: "normal" },
  { name: "Inter", data: bold, weight: 700, style: "normal" },
];
