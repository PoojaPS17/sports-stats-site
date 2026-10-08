import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Palette B: a loss is neutral grey (red/coral is LIVE only), lime survives only in the logo.
const FILES: Record<string, RegExp[]> = {
  "../src/components/PlayerStatsShared.tsx": [/emerald-/, /rose-/],
  "../src/components/PlayerFormChart.tsx": [/#10b981/i, /#f43f5e/i],
  "../src/components/InjuriesExportCard.tsx": [/#fee2e2/i, /#b91c1c/i, /#fef3c7/i],
  "../src/components/home/blocks/TeamNextBlock.tsx": [/#dc2626/i, /#15803d/i],
  "../src/app/[league]/projections/page.tsx": [/220, 38, 38/],
  "../src/components/ProjectionsExportCards.tsx": [/220, 38, 38/],
  "../src/lib/articleArt.ts": [/c8f135/i],
  "../src/app/globals.css": [/c8f135/i],
};

test("result colours and article art follow Palette B", () => {
  for (const [file, banned] of Object.entries(FILES)) {
    const src = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const re of banned) assert.ok(!re.test(src), `${file} still has ${re}`);
  }
});
