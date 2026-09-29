import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "ops/crew";
const IDS = ["physio", "umpire", "kit-manager", "analyst", "scout", "editor", "press-officer", "scorer", "steward", "groundsman"];
const GROUPS = ["officials", "backroom", "front-office"];
const FORBIDDEN = [/\bgit (commit|push|merge)\b/i, /\bgh pr (create|merge|comment|review)\b/i, /\bpost (it|this|the tweet) to x\b/i];
// The one actor writes its own rules instead of carrying the reporters' protocol, and must say these.
const ACTOR_MUST_SAY = ["never merges", "never pushes to `main`", "pull request", "order", "PushNotification"];

function frontMatter(source: string): Record<string, string> {
  const m = source.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "front matter block");
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const [k, ...rest] = line.split(":");
    out[k.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
  }
  return out;
}

test("every crew file is complete, forbids the right things and carries the reporting protocol hook", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  assert.deepEqual(files.map((f) => f.replace(/\.md$/, "")).sort(), [...IDS].sort());
  for (const f of files) {
    const source = readFileSync(join(DIR, f), "utf8");
    const fm = frontMatter(source);
    assert.equal(fm.id, f.replace(/\.md$/, ""));
    for (const key of ["name", "role", "group", "schedule", "model", "job", "never", "when", "kind"]) assert.ok(fm[key], `${f}: ${key}`);
    assert.ok(["reporter", "actor"].includes(fm.kind), `${f}: kind ${fm.kind}`);
    assert.ok(GROUPS.includes(fm.group), `${f}: group ${fm.group}`);
    assert.match(fm.schedule, /^(\S+\s+){4}\S+$/, `${f}: five-field cron`);
    assert.ok(source.includes("{{OPS_ROOM_URL}}"), `${f}: artifact url placeholder`);
    assert.ok(/^## Never/m.test(source), `${f}: a Never section`);
    assert.ok(!source.includes("—"), `${f}: no em-dashes`);
    if (fm.kind === "reporter") {
      assert.notEqual(fm.protocol, "none", `${f}: reporters carry the protocol`);
      for (const re of FORBIDDEN) assert.ok(!re.test(source), `${f}: matches ${re}`);
    } else {
      assert.equal(fm.protocol, "none", `${f}: the actor writes its own rules`);
      for (const must of ACTOR_MUST_SAY) assert.ok(source.includes(must), `${f}: must say "${must}"`);
    }
  }
});

test("the protocol explains the issue rules and the finishing line", () => {
  const p = readFileSync(join(DIR, "_protocol.md"), "utf8");
  for (const s of ["ArtifactData", "runs/", "issues/", "crew/", "autoResolved", "RESULT:", "if_version", "60 days"]) assert.ok(p.includes(s), s);
});

test("seed.json mirrors the crew files", () => {
  const seed = JSON.parse(readFileSync("ops/room/seed.json", "utf8"));
  assert.deepEqual(Object.keys(seed.crew).sort(), [...IDS].sort());
  for (const id of IDS) {
    const fm = frontMatter(readFileSync(join(DIR, `${id}.md`), "utf8"));
    for (const key of ["name", "role", "group", "job", "never", "when", "schedule", "model", "kind"]) assert.equal(seed.crew[id][key], fm[key], `${id}.${key}`);
  }
  assert.ok(Object.keys(seed.rules).length >= 6);
  assert.ok(seed.rules.r3.text.startsWith("Reporters report."), "rule 3 names the Groundsman's limit");
  for (const r of Object.values(seed.rules) as { text: string; order: number }[]) assert.ok(r.text && typeof r.order === "number");
});

test("the Chrome task carries the current protocol, not a drifted copy of it", () => {
  const protocol = readFileSync(join(DIR, "_protocol.md"), "utf8").trim();
  const chrome = readFileSync(join(DIR, "_chrome-readings.md"), "utf8").trim();
  assert.ok(chrome.endsWith(protocol), "_chrome-readings.md must end with _protocol.md verbatim");
});
