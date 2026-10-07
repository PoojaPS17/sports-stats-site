import { test } from "node:test";
import assert from "node:assert/strict";
import { ImageResponse } from "next/og";
import { OG_SIZE, ogCard, ogRivalry } from "../src/lib/ogCard";

// The renderer throws on an element with several children and no explicit display, which no type check sees:
// draw the real card the way the route does.
const pills = [{ text: "BOS", border: "#007a33" }, { text: "MIA", border: "#98002e" }, { text: "D", border: "#6b7690" }];

test("the head-to-head share image draws with a label and results", async () => {
  const res = new ImageResponse(ogCard({ kicker: "Head to head", title: "Celtics vs Heat", detail: "10 meetings", children: ogRivalry({ record: "6-0-4", label: "Slight edge to Celtics", pills }) }), OG_SIZE);
  assert.ok((await res.arrayBuffer()).byteLength > 1000);
});

test("it also draws with no label and no results", async () => {
  const res = new ImageResponse(ogCard({ kicker: "Head to head", title: "A vs B", children: ogRivalry({ record: "1-0-0", label: null, pills: [] }) }), OG_SIZE);
  assert.ok((await res.arrayBuffer()).byteLength > 1000);
});
