import { before, test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
case "$*" in *"$STUB_FAIL"*) [ -n "$STUB_FAIL" ] && exit 1 ;; esac
case "$*" in
  *check:live*) printf 'should_scrape=%s\\nmode=live\\nleagues=%s\\n' "$STUB_SHOULD" "$STUB_LEAGUES" >> "$GITHUB_OUTPUT" ;;
esac
exit 0
`
  );
  // Stub git: log the call; STUB_GIT_REWRITE makes a pull overwrite that file in place (like a pull that ships a new scrape.sh).
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh
echo "git $*" >> "$STUB_LOG"
[ -n "$STUB_GIT_FAIL" ] && exit 1
[ -n "$STUB_GIT_REWRITE" ] && printf '#!/usr/bin/env bash\\n# rewritten by git pull\\n' > "$STUB_GIT_REWRITE"
exit 0
`
  );
  chmodSync(join(bin, "npm"), 0o755);
  chmodSync(join(bin, "git"), 0o755);
  // Stub curl: "download" by touching whatever -o pointed at.
  writeFileSync(
    join(bin, "curl"),
    `#!/bin/sh
echo "curl $*" >> "$STUB_LOG"
while [ $# -gt 0 ]; do
  case "$1" in -o) touch "$2" ;; esac
  shift
done
exit 0
`
  );
  // Stub python3: the only call job_cricsheet makes is the zipfile extractall one-liner; fake it
  // by creating the destination directory instead of really unzipping the (fake) archive.
  writeFileSync(
    join(bin, "python3"),
    `#!/bin/sh
echo "python3 $*" >> "$STUB_LOG"
mkdir -p "$4"
exit 0
`
  );
  chmodSync(join(bin, "curl"), 0o755);
  chmodSync(join(bin, "python3"), 0o755);
});

function run(job: string, env: Record<string, string> = {}, runner: string = RUNNER) {
  const log = join(dir, `${job}-${Math.random().toString(36).slice(2)}.log`);
  writeFileSync(log, "");
  const res = spawnSync("bash", [runner, job], {
    // NODE_ENV is only here because Next's type augmentation makes it required on ProcessEnv.
    env: { NODE_ENV: "test", PATH: `${bin}:/usr/bin:/bin`, SCRAPE_DIR: dir, STUB_LOG: log, STUB_SHOULD: "false", STUB_LEAGUES: "", STUB_FAIL: "", STUB_GIT_FAIL: "", STUB_GIT_REWRITE: "", ...env },
    encoding: "utf8",
  });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return { status: res.status, calls, stderr: res.stderr };
}

test("idle tick: checks live games, then only the always-on tennis and cricket feeds, then the heartbeat", () => {
  const { status, calls } = run("tick");
  assert.equal(status, 0);
  assert.deepEqual(
    calls.map((c) => c.split(" | ")[0]),
    [
      "npm run --silent check:live",
      "npm run --silent fetch:tennis-daily",
      "npm run --silent fetch:cricket-series -- --days 1 --ahead 2",
      "npm run --silent record:run -- scrape-tick",
    ]
  );
  assert.match(calls[0], /FORCE=false/);
});

test("live tick: scopes seed and fetch to the flagged leagues in live mode", () => {
  const { status, calls } = run("tick", { STUB_SHOULD: "true", STUB_LEAGUES: "nba,epl" });
  assert.equal(status, 0);
  assert.ok(calls.includes("npm run --silent seed:teams | MODE= LEAGUES=nba,epl FORCE="));
  assert.ok(calls.includes("npm run --silent fetch:all | MODE=live LEAGUES=nba,epl FORCE="));
  assert.match(calls[calls.length - 1], /^npm run --silent record:run -- scrape-tick \|/);
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
  // The cricket safety nets run after the windowed importer, so a match it imports is not fetched twice.
  const at = (step: string) => steps.indexOf(step);
  assert.ok(at("npm run --silent import:cricket-espn") >= 0);
  assert.ok(at("npm run --silent import:cricket-espn -- --reconcile") > at("npm run --silent import:cricket-espn"));
  assert.ok(at("npm run --silent topup:cricket-player-stats") > at("npm run --silent import:cricket-espn -- --reconcile"));
});

test("a failing cricket top-up (exit 1 when any game failed) fails the daily job but not the steps after it", () => {
  const { status, calls } = run("daily", { STUB_FAIL: "topup:cricket-player-stats" });
  assert.equal(status, 1);
  assert.ok(calls.map((c) => c.split(" | ")[0]).some((x) => x.includes("seed:f1-teams")));
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

test("a failing check:live skips the scoped fetch but still runs the always-on feeds, and exits 1", () => {
  // The stub fails before writing its outputs, like the real script crashing before it decides.
  const { status, calls } = run("tick", { STUB_FAIL: "check:live", STUB_SHOULD: "true", STUB_LEAGUES: "nba" });
  assert.equal(status, 1);
  const steps = calls.map((c) => c.split(" | ")[0]);
  assert.deepEqual(steps, ["npm run --silent check:live", "npm run --silent fetch:tennis-daily", "npm run --silent fetch:cricket-series -- --days 1 --ahead 2"]);
});

test("idle tick (should_scrape=false) never seeds or fetches the leagues", () => {
  const steps = run("tick", { STUB_SHOULD: "false" }).calls.map((c) => c.split(" | ")[0]);
  assert.ok(!steps.some((s) => s.includes("fetch:all") || s.includes("seed:teams")));
});

test("a failing git pull in daily exits 1 but the remaining daily steps still run", () => {
  const { status, calls } = run("daily", { STUB_GIT_FAIL: "1" });
  assert.equal(status, 1);
  const steps = calls.map((c) => c.split(" | ")[0]);
  assert.equal(steps[0], "git pull --ff-only --quiet");
  assert.equal(steps[1], "npm run --silent migrate");
  assert.ok(steps.includes("npm run --silent fetch:all"));
  assert.ok(steps.includes("npm run --silent seed:f1-teams"));
  assert.ok(!steps.some((s) => s.includes("npm ci")));
});

test("a leaked SCRAPE_MODE / SCRAPE_LEAGUES never narrows daily or hourly steps", () => {
  const leak = { SCRAPE_MODE: "live", SCRAPE_LEAGUES: "nba" };
  const daily = run("daily", leak);
  assert.equal(daily.status, 0);
  assert.ok(daily.calls.includes("npm run --silent fetch:all | MODE=full LEAGUES= FORCE="));
  assert.ok(daily.calls.includes("npm run --silent seed:teams | MODE= LEAGUES= FORCE="));
  const hourly = run("hourly", leak);
  assert.ok(hourly.calls.every((c) => c.endsWith("| MODE= LEAGUES= FORCE=")));
});

test("a leaked SCRAPE_LEAGUES never reaches the tick's own scoped steps", () => {
  const { calls } = run("tick", { SCRAPE_MODE: "full", SCRAPE_LEAGUES: "nfl", STUB_SHOULD: "true", STUB_LEAGUES: "epl" });
  assert.ok(calls.includes("npm run --silent fetch:all | MODE=live LEAGUES=epl FORCE="));
  const feeds = calls.filter((c) => c.includes("tennis-daily") || c.includes("cricket-series"));
  assert.ok(feeds.length === 2 && feeds.every((c) => c.endsWith("| MODE= LEAGUES= FORCE=")));
});

test("a missing SCRAPE_DIR exits 1 with a message and runs nothing", () => {
  const { status, calls, stderr } = run("hourly", { SCRAPE_DIR: join(dir, "does-not-exist") });
  assert.equal(status, 1);
  assert.deepEqual(calls, []);
  assert.match(stderr, /cannot cd to .*does-not-exist/);
});

test("the check:live temp file is removed after a tick", () => {
  const tmp = join(dir, "tmp-clean");
  mkdirSync(tmp);
  run("tick", { TMPDIR: tmp });
  assert.deepEqual(readdirSync(tmp), []);
});

test("a daily job still exits 1 when its own git pull rewrites scrape.sh mid-run", () => {
  // bash reads a script by offset, so a pull that replaces it must not change the exit status.
  const copy = join(dir, "scrape-copy.sh");
  copyFileSync(RUNNER, copy);
  const { status, calls } = run("daily", { STUB_FAIL: "migrate", STUB_GIT_REWRITE: copy }, copy);
  assert.ok(calls.includes("git pull --ff-only --quiet"));
  assert.ok(readFileSync(copy, "utf8").includes("rewritten by git pull"), "the stub pull should have replaced the script");
  assert.equal(status, 1);
});

test("a tick records its heartbeat last, and only when no step failed", () => {
  const clean = run("tick", { STUB_SHOULD: "true", STUB_LEAGUES: "nba" });
  assert.equal(clean.status, 0);
  const cleanSteps = clean.calls.map((c) => c.split(" | ")[0]);
  assert.equal(cleanSteps[cleanSteps.length - 1], "npm run --silent record:run -- scrape-tick");
  assert.equal(cleanSteps.filter((s) => s.includes("record:run")).length, 1);

  for (const fail of ["check:live", "seed:teams", "fetch:all", "fetch:tennis-daily", "fetch:cricket-series"]) {
    const res = run("tick", { STUB_SHOULD: "true", STUB_LEAGUES: "nba", STUB_FAIL: fail });
    assert.equal(res.status, 1, `${fail} failing should fail the tick`);
    assert.ok(!res.calls.some((c) => c.includes("record:run")), `no heartbeat when ${fail} fails`);
  }
});

test("only ticks record a heartbeat", () => {
  for (const job of ["daily", "hourly"]) {
    assert.ok(!run(job).calls.some((c) => c.includes("record:run")), `${job} must not record scrape-tick`);
  }
});

test("cricsheet: migrates, downloads and imports all four archives, and exits 0", () => {
  const { status, calls, stderr } = run("cricsheet");
  assert.equal(status, 0, stderr);
  const steps = calls.map((c) => c.split(" | ")[0]);
  assert.equal(steps[0], "npm run --silent migrate");
  for (const archive of ["odi", "t20i", "ipl", "bbl"]) {
    assert.ok(steps.some((s) => s.includes(`import:cricsheet -- ${archive} `)), `cricsheet should import ${archive}`);
  }
});

test("cricsheet: its scratch dir is removed after the job returns, without an unbound-variable error", () => {
  const tmp = join(dir, "tmp-cricsheet");
  mkdirSync(tmp);
  const { status, stderr } = run("cricsheet", { TMPDIR: tmp });
  assert.equal(status, 0, stderr);
  assert.doesNotMatch(stderr, /unbound variable/);
  assert.deepEqual(readdirSync(tmp), []);
});

test("cricsheet: a failing import still exits 1 but does not leak an unbound-variable error", () => {
  const { status, stderr } = run("cricsheet", { STUB_FAIL: "import:cricsheet -- ipl" });
  assert.equal(status, 1);
  assert.doesNotMatch(stderr, /unbound variable/);
});
