import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "ops/crew";
const IDS = ["physio", "umpire", "kit-manager", "analyst", "scout", "editor", "press-officer", "scorer", "steward"];
const GROUPS = ["officials", "backroom", "front-office"];
const FORBIDDEN = [/\bgit (commit|push|merge)\b/i, /\bgh pr (create|merge|comment|review)\b/i, /\bpost (it|this|the tweet) to x\b/i];

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
    for (const key of ["name", "role", "group", "schedule", "model", "job", "never", "when"]) assert.ok(fm[key], `${f}: ${key}`);
    assert.ok(GROUPS.includes(fm.group), `${f}: group ${fm.group}`);
    assert.match(fm.schedule, /^(\S+\s+){4}\S+$/, `${f}: five-field cron`);
    assert.ok(source.includes("{{OPS_ROOM_URL}}"), `${f}: artifact url placeholder`);
    assert.ok(/^## Never/m.test(source), `${f}: a Never section`);
    assert.ok(!source.includes("—"), `${f}: no em-dashes`);
    for (const re of FORBIDDEN) assert.ok(!re.test(source), `${f}: matches ${re}`);
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
    for (const key of ["name", "role", "group", "job", "never", "when", "schedule", "model"]) assert.equal(seed.crew[id][key], fm[key], `${id}.${key}`);
  }
  assert.ok(Object.keys(seed.rules).length >= 6);
  for (const r of Object.values(seed.rules) as { text: string; order: number }[]) assert.ok(r.text && typeof r.order === "number");
});
