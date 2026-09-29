import { test } from "node:test";
import assert from "node:assert/strict";

test("a reporter's prompt is body plus protocol with the URL substituted; the actor's is body alone", async () => {
  const { buildRoutine } = await import("../scripts/ops/build-routine");
  const r = buildRoutine("ops/crew/physio.md", "https://claude.ai/artifact/X");
  assert.equal(r.name, "Ops Room: Physio (site health)");
  assert.equal(r.cron, "30 0 * * *");
  assert.equal(r.model, "claude-sonnet-5");
  assert.equal(r.kind, "reporter");
  assert.ok(r.prompt.includes("## Reporting protocol"));
  assert.ok(!r.prompt.includes("{{OPS_ROOM_URL}}"));
  assert.ok(r.prompt.includes("https://claude.ai/artifact/X"));
  assert.ok(!r.prompt.startsWith("---"), "front matter is not part of the prompt");
  assert.deepEqual(r.sources, ["https://github.com/PoojaPS17/sports-stats-site"]);
  assert.ok(!r.allowedTools.includes("PushNotification") && !r.allowedTools.includes("Write"));
  const u = buildRoutine("ops/crew/umpire.md", "https://claude.ai/artifact/X");
  assert.deepEqual(u.sources, [], "the Umpire reads over HTTPS and needs no clone");
  const g = buildRoutine("ops/crew/groundsman.md", "https://claude.ai/artifact/X");
  assert.equal(g.kind, "actor");
  assert.ok(!g.prompt.includes("## Reporting protocol"));
  assert.ok(g.prompt.includes("## Issue rules"));
  for (const t of ["PushNotification", "Write", "Edit", "ArtifactData", "Bash"]) assert.ok(g.allowedTools.includes(t), t);
  assert.deepEqual(g.sources, ["https://github.com/PoojaPS17/sports-stats-site"]);
});
