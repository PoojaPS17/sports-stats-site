import { before, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const RUNNER = resolve(process.cwd(), "deploy/vm/scrape.sh");
let bin: string;
let dir: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "scrape-runner-"));
  bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(dir, "package-lock.json"), "{}");
  // Stub npm: log the call and the scope env, emulate check:live's outputs, fail on demand.
  writeFileSync(
    join(bin, "npm"),
    `#!/bin/sh
echo "npm $* | MODE=\${SCRAPE_MODE-} LEAGUES=\${SCRAPE_LEAGUES-} FORCE=\${FORCE_SCRAPE-}" >> "$STUB_LOG"
case "$*" in
  *check:live*) printf 'should_scrape=%s\\nmode=live\\nleagues=%s\\n' "$STUB_SHOULD" "$STUB_LEAGUES" >> "$GITHUB_OUTPUT" ;;
esac
case "$*" in *"$STUB_FAIL"*) [ -n "$STUB_FAIL" ] && exit 1 ;; esac
exit 0
`
  );
  writeFileSync(join(bin, "git"), `#!/bin/sh\necho "git $*" >> "$STUB_LOG"\n`);
  chmodSync(join(bin, "npm"), 0o755);
  chmodSync(join(bin, "git"), 0o755);
});

function run(job: string, env: Record<string, string> = {}) {
  const log = join(dir, `${job}-${Math.random().toString(36).slice(2)}.log`);
  writeFileSync(log, "");
  const res = spawnSync("bash", [RUNNER, job], {
    // NODE_ENV is only here because Next's type augmentation makes it required on ProcessEnv.
    env: { NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin`, SCRAPE_DIR: dir, STUB_LOG: log, STUB_SHOULD: "false", STUB_LEAGUES: "", STUB_FAIL: "", ...env },
    encoding: "utf8",
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { status: res.status, calls, stderr: res.stderr };
}

test("idle tick: checks live games, then only the always-on tennis and cricket feeds", () => {
  const { status, calls } = run("tick");
  assert.equal(status, 0);
  assert.deepEqual(
    calls.map((c) => c.split(" | ")[0]),
    ["npm run --silent check:live", "npm run --silent fetch:tennis-daily", "npm run --silent fetch:cricket-series -- --days 1 --ahead 2"]
  );
  assert.match(calls[0], /FORCE=false/);
});

test("live tick: scopes seed and fetch to the flagged leagues in live mode", () => {
  const { status, calls } = run("tick", { STUB_SHOULD: "true", STUB_LEAGUES: "nba,epl" });
  assert.equal(status, 0);
  assert.ok(calls.includes("npm run --silent seed:teams | MODE= LEAGUES=nba,epl FORCE="));
  assert.ok(calls.includes("npm run --silent fetch:all | MODE=live LEAGUES=nba,epl FORCE="));
});

test("daily: updates code, migrates first, runs a full unscoped fetch, then the daily-only steps", () => {
  const { status, calls } = run("daily");
  assert.equal(status, 0);
  const steps = calls.map((c) => c.split(" | ")[0]);
  assert.equal(steps[0], "git pull --ff-only --quiet");
  assert.equal(steps[1], "npm run --silent migrate");
  assert.ok(calls.includes("npm run --silent fetch:all | MODE=full LEAGUES= FORCE="));
  for (const s of ["fetch:fixtures", "import:cricket-espn", "fetch:tennis-rankings", "seed:f1-teams"]) {
    assert.ok(steps.some((x) => x.includes(s)), `daily should run ${s}`);
  }
  assert.ok(steps.includes("npm run --silent fetch:cricket-series -- --days 10 --ahead 90"));
});

test("hourly: injuries, F1 scores and standings, then the stale check last", () => {
  const { status, calls } = run("hourly");
  assert.equal(status, 0);
  assert.deepEqual(
    calls.map((c) => c.split(" | ")[0]),
    ["npm run --silent fetch:injuries", "npm run --silent fetch:f1-scores", "npm run --silent fetch:f1-standings", "npm run --silent check:stale"]
  );
});

test("a failing step does not stop later steps, but the job exits 1", () => {
  const { status, calls } = run("hourly", { STUB_FAIL: "fetch:injuries" });
  assert.equal(status, 1);
  assert.equal(calls.length, 4);
});

test("unknown job exits 2", () => {
  assert.equal(run("nonsense").status, 2);
});
