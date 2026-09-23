import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_FONTS } from "../src/lib/cardFont";

test("the card font bundle has a regular and a bold Inter weight, well under the ImageResponse 500KB ceiling", () => {
  assert.equal(CARD_FONTS.length, 2);
  const weights = CARD_FONTS.map((f) => f.weight).sort();
  assert.deepEqual(weights, [400, 700]);
  for (const f of CARD_FONTS) {
    assert.equal(f.name, "Inter");
    assert.equal(f.style, "normal");
    assert.ok(f.data.byteLength > 0, "font file must not be empty");
  }
  const total = CARD_FONTS.reduce((sum, f) => sum + f.data.byteLength, 0);
  assert.ok(total < 300_000, `combined font size ${total} bytes is too large for a 500KB ImageResponse budget shared with JSX/CSS`);
});

// --- Minimal TTF `cmap` parser -------------------------------------------
//
// Reads a font buffer's `cmap` table directly (format 4 or format 12
// subtable) and reports whether a given codepoint maps to a non-zero glyph
// ID. No external dependency — this is a defect-class regression guard for
// the fix-round-1 review finding that the previously-shipped fonts were
// missing required Latin Extended-A glyphs (see
// .superpowers/sdd/2026-09-22-player-performance-cards-phase1/task-1-fix-round-1-brief.md).
function findCmapSubtable(buf: Buffer): { subtableOffset: number; format: number } {
  const numTables = buf.readUInt16BE(4);
  let cmapOffset: number | null = null;
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    const tag = buf.toString("ascii", record, record + 4);
    if (tag === "cmap") {
      cmapOffset = buf.readUInt32BE(record + 8);
      break;
    }
  }
  if (cmapOffset === null) throw new Error("font buffer has no cmap table");

  const numSubtables = buf.readUInt16BE(cmapOffset + 2);
  let format4Offset: number | null = null;
  for (let i = 0; i < numSubtables; i++) {
    const record = cmapOffset + 4 + i * 8;
    const offset = buf.readUInt32BE(record + 4);
    const subtableOffset = cmapOffset + offset;
    const format = buf.readUInt16BE(subtableOffset);
    // Prefer a format 12 subtable (full Unicode coverage) when present;
    // otherwise fall back to the first format 4 subtable found.
    if (format === 12) return { subtableOffset, format: 12 };
    if (format === 4 && format4Offset === null) format4Offset = subtableOffset;
  }
  if (format4Offset !== null) return { subtableOffset: format4Offset, format: 4 };
  throw new Error("no format 4 or format 12 cmap subtable found");
}

function hasGlyphForCodepoint(buf: Buffer, codepoint: number): boolean {
  const { subtableOffset, format } = findCmapSubtable(buf);

  if (format === 12) {
    const numGroups = buf.readUInt32BE(subtableOffset + 12);
    for (let i = 0; i < numGroups; i++) {
      const record = subtableOffset + 16 + i * 12;
      const startCharCode = buf.readUInt32BE(record);
      const endCharCode = buf.readUInt32BE(record + 4);
      if (codepoint >= startCharCode && codepoint <= endCharCode) return true;
    }
    return false;
  }

  // format === 4
  const segCountX2 = buf.readUInt16BE(subtableOffset + 6);
  const segCount = segCountX2 / 2;
  const endCodeOffset = subtableOffset + 14;
  const startCodeOffset = endCodeOffset + segCountX2 + 2; // +2 skips reservedPad
  const idDeltaOffset = startCodeOffset + segCountX2;
  const idRangeOffsetOffset = idDeltaOffset + segCountX2;

  for (let i = 0; i < segCount; i++) {
    const endCode = buf.readUInt16BE(endCodeOffset + i * 2);
    const startCode = buf.readUInt16BE(startCodeOffset + i * 2);
    if (codepoint < startCode || codepoint > endCode) continue;

    const idRangeOffset = buf.readUInt16BE(idRangeOffsetOffset + i * 2);
    const idDelta = buf.readInt16BE(idDeltaOffset + i * 2);
    if (idRangeOffset === 0) {
      // Glyph id computed directly by idDelta arithmetic (mod 65536).
      const glyphId = (codepoint + idDelta) & 0xffff;
      return glyphId !== 0;
    }
    const glyphIndexAddress = idRangeOffsetOffset + i * 2 + idRangeOffset + (codepoint - startCode) * 2;
    const rawGlyphId = buf.readUInt16BE(glyphIndexAddress);
    if (rawGlyphId === 0) return false;
    const glyphId = (rawGlyphId + idDelta) & 0xffff;
    return glyphId !== 0;
  }
  return false;
}

test("both CARD_FONTS entries embed the Latin Extended-A glyphs the design spec's diacritic acceptance names depend on", () => {
  // Exact codepoint list from the fix-round-1 brief: Č/č, Ć/ć, Đ/đ, Š/š,
  // Ž/ž, Ş/ş — required for Dončić, Jokić, Vučević, Şengün.
  const requiredCodepoints: Record<string, number> = {
    "Č (U+010C)": 0x010c,
    "č (U+010D)": 0x010d,
    "Ć (U+0106)": 0x0106,
    "ć (U+0107)": 0x0107,
    "Đ (U+0110)": 0x0110,
    "đ (U+0111)": 0x0111,
    "Š (U+0160)": 0x0160,
    "š (U+0161)": 0x0161,
    "Ž (U+017D)": 0x017d,
    "ž (U+017E)": 0x017e,
    "Ş (U+015E)": 0x015e,
    "ş (U+015F)": 0x015f,
  };

  for (const font of CARD_FONTS) {
    for (const [label, codepoint] of Object.entries(requiredCodepoints)) {
      assert.ok(
        hasGlyphForCodepoint(font.data, codepoint),
        `Inter weight ${font.weight} is missing a glyph for ${label} (needed for names like Dončić, Vučević, Şengün)`,
      );
    }
  }
});
