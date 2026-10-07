import { test } from "node:test";
import assert from "node:assert/strict";
import { activeNotice } from "../src/lib/siteNotice";

const notice = { text: "Soccer scores are paused for the international break.", since: "2026-10-07", until: "2026-10-12" };

test("no notice configured shows nothing", () => {
  assert.equal(activeNotice(null), null);
});

test("a notice shows through the whole of its last day", () => {
  assert.equal(activeNotice(notice, new Date("2026-10-12T23:00:00Z")), notice);
});

test("a notice hides itself the day after its end date", () => {
  assert.equal(activeNotice(notice, new Date("2026-10-13T00:30:00Z")), null);
});

test("a notice with no end date keeps showing", () => {
  const open = { text: "x", since: "2026-10-07" };
  assert.equal(activeNotice(open, new Date("2027-01-01T00:00:00Z")), open);
});
