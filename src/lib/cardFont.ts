import { readFileSync } from "node:fs";
import { join } from "node:path";

// Read once at module scope (next/og docs: "The font doesn't depend on request
// data, so read it once at module scope"). assets/fonts holds Plus Jakarta Sans
// (OFL, licence text alongside) in the three weights the card uses, subsetted
// with fontTools to printable ASCII (U+0020-U+007E), Latin-1 Supplement and
// Latin Extended-A (U+00A0-U+017F) and general punctuation (U+2010-U+2027), so
// the whole bundle stays well inside the ImageResponse budget. The same face
// serves body and display on the site, so the card needs only one family.
const regular = readFileSync(join(process.cwd(), "assets/fonts/PlusJakartaSans-Regular.ttf"));
const bold = readFileSync(join(process.cwd(), "assets/fonts/PlusJakartaSans-Bold.ttf"));
const extraBold = readFileSync(join(process.cwd(), "assets/fonts/PlusJakartaSans-ExtraBold.ttf"));

export const CARD_FONTS: { name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" }[] = [
  { name: "Plus Jakarta Sans", data: regular, weight: 400, style: "normal" },
  { name: "Plus Jakarta Sans", data: bold, weight: 700, style: "normal" },
  { name: "Plus Jakarta Sans", data: extraBold, weight: 800, style: "normal" },
];
