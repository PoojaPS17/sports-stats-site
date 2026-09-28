import { test } from "node:test";
import assert from "node:assert/strict";
import { topicsFor } from "../src/lib/articleTopics";

test("topics are the distinct palettes of the articles, most frequent first, with labels", () => {
  const topics = topicsFor([
    { tags: ["asian-games"] },
    { tags: ["f1"] },
    { tags: ["premier-league"], art: { palette: "football" } },
    { tags: ["kabaddi"] },
  ]);
  assert.deepEqual(topics, [
    { key: "asian-games", label: "Asian Games", count: 2 },
    { key: "f1", label: "Formula 1", count: 1 },
    { key: "football", label: "Football", count: 1 },
  ]);
});
