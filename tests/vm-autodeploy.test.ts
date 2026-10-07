import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Static checks only: nothing here loads a unit into systemd or runs the deploy.
const VM_DIR = resolve(process.cwd(), "deploy/vm");
const UNIT_DIR = join(VM_DIR, "systemd");
const APP_ROOT = "/opt/sportsdb/repo";

type Unit = Record<string, Record<string, string[]>>;

function parseUnit(file: string): Unit {
  const unit: Unit = {};
  let section = "";
  for (const raw of readFileSync(join(UNIT_DIR, file), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1];
      unit[section] ??= {};
      continue;
    }
    const eq = line.indexOf("=");
    assert.ok(section && eq > 0, `${file}: unparseable line "${line}"`);
    (unit[section][line.slice(0, eq).trim()] ??= []).push(line.slice(eq + 1).trim());
  }
  return unit;
}

function single(unit: Unit, section: string, key: string): string {
  const values = unit[section]?.[key];
  assert.ok(values, `missing ${section}/${key}`);
  assert.equal(values.length, 1, `${section}/${key} set more than once`);
  return values[0];
}

test("deploy timer polls origin/main every ten minutes without catch-up runs", () => {
  const timer = parseUnit("sportsdb-deploy.timer");
  assert.equal(single(timer, "Timer", "Unit"), "sportsdb-deploy.service");
  assert.equal(single(timer, "Timer", "OnCalendar"), "*:0/10");
  assert.equal(timer.Timer.Persistent, undefined, "a missed poll is simply the next poll");
  assert.equal(single(timer, "Install", "WantedBy"), "timers.target");
});

test("deploy service is a oneshot run as ubuntu from the app checkout, serialised on its own lock", () => {
  const svc = parseUnit("sportsdb-deploy.service");
  assert.equal(single(svc, "Service", "Type"), "oneshot");
  assert.equal(single(svc, "Service", "User"), "ubuntu");
  assert.equal(single(svc, "Service", "WorkingDirectory"), APP_ROOT);
  assert.equal(
    single(svc, "Service", "ExecStart"),
    `/usr/bin/flock -n -E 0 /run/lock/sportsdb-deploy.lock /bin/bash ${APP_ROOT}/deploy/vm/autodeploy.sh`,
  );
  assert.equal(single(svc, "Service", "TimeoutStartSec"), "30min");
  assert.equal(svc.Service.SuccessExitStatus, undefined, "a failed deploy must show as a failed unit");
  // NODE_ENV=production in the environment makes npm ci drop tsx and the build tooling (the 2026-10-03 outage).
  const env = svc.Service.Environment ?? [];
  assert.ok(!env.some((v) => /NODE_ENV/.test(v)), "NODE_ENV must stay unset for npm ci");
});

test("autodeploy.sh compares origin/main with the sha it last BUILT, not with the checkout's HEAD", () => {
  const src = readFileSync(join(VM_DIR, "autodeploy.sh"), "utf8");
  assert.match(src, /git fetch/);
  assert.match(src, /origin\/main/);
  // A manual `git pull` on the VM moves HEAD without building anything (2026-10-03: the first
  // timer run saw HEAD == origin/main and exited while the app still served the old build).
  // The marker holds the sha that was built and started, and is written only after a healthy start.
  assert.match(src, /built_marker=.*\.deployed\.sha/);
  assert.match(readFileSync(resolve(process.cwd(), ".gitignore"), "utf8"), /^\.deployed\.sha$/m);
  assert.doesNotMatch(src, /git rev-parse HEAD/, "HEAD is not evidence of what is running");
  assert.ok(src.indexOf('> "$built_marker"') > src.indexOf("curl -fsS"), "marker written after the health check passes");
  // bash reads a script as it runs; a fast-forward can replace this file mid-deploy, so every
  // line must be parsed before the first command runs: the body lives in main() and is called last.
  assert.match(src, /^main\(\) \{/m);
  assert.match(src, /^main "\$@"\s*$/m);
  assert.match(src, /unset NODE_ENV/);
  assert.match(src, /npm run migrate/);
  assert.match(src, /npm run build/);
  assert.match(src, /systemctl start sportsdb-app/);
  assert.match(src, /\/api\/health/);
  assert.doesNotMatch(src, /git (reset --hard|push|stash)/, "the script only fast-forwards");
});

test("install.sh installs and enables the deploy timer", () => {
  const src = readFileSync(join(VM_DIR, "install.sh"), "utf8");
  assert.match(src, /sportsdb-deploy\.service/);
  assert.match(src, /sportsdb-deploy\.timer/);
  assert.match(src, /enable --now[^\n]*sportsdb-deploy\.timer/);
});

// Behavioural run with shims on PATH: git, npm, sudo, curl and sleep are fake executables that append
// to a log, so the test can read the ORDER of the deploy's steps without a VM. The build must finish
// before the app is stopped (every merge took the site offline for the whole build until 2026-10-07:
// twelve merges that day gave Googlebot 86 server errors and it cut its crawl rate by three quarters).
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

function shim(bin: string, name: string, body: string) {
  writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
}

// Lays out a fake VM: a live checkout with an old build, and the files the script reads.
function fakeVm(opts: { lockAfterFetch?: string; healthy?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "autodeploy-"));
  const bin = join(root, "bin");
  const repo = join(root, "repo");
  const build = join(root, "build");
  const log = join(root, "log");
  mkdirSync(bin);
  mkdirSync(join(repo, "node_modules"), { recursive: true });
  mkdirSync(join(repo, ".next"));
  writeFileSync(join(repo, ".next", "BUILD_ID"), "old");
  writeFileSync(join(repo, "node_modules", ".installed-from"), "lock-v1");
  writeFileSync(join(repo, "package-lock.json"), "lock-v1");
  writeFileSync(join(repo, ".env.production"), "NEXT_PUBLIC_SITE_URL=https://example.test\n");
  writeFileSync(join(repo, ".deployed.sha"), "old-sha\n");
  writeFileSync(join(root, "scrape.env"), "DATABASE_URL=postgres://user:secret@127.0.0.1/db\n");
  const record = `echo "$(basename "$0") $*" >> "${log}"`;
  const newLock = opts.lockAfterFetch ?? "";
  // git: a clone makes the build checkout; a checkout or merge "brings" the new lock file when the
  // scenario changes it; rev-parse names the sha being deployed.
  shim(
    bin,
    "git",
    `${record}
case "$1" in
  -C) shift 2; set -- "$@";;
esac
case "$1" in
  clone) mkdir -p "\${@: -1}"; cp "${repo}/package-lock.json" "\${@: -1}/";;
  checkout|merge) [ -n "${newLock}" ] && echo "${newLock}" > package-lock.json;;
  remote) echo https://example.test/repo.git;;
  rev-parse) echo new-sha;;
esac
exit 0`,
  );
  // npm: a build writes a BUILD_ID that names the directory it ran in; ci stamps node_modules with the lock it saw.
  shim(
    bin,
    "npm",
    `${record}
case "$*" in
  "run build") mkdir -p .next/cache; echo "built-in-$PWD" > .next/BUILD_ID; echo warm > .next/cache/compiler;;
  ci*) mkdir -p node_modules; cat package-lock.json > node_modules/.installed-from;;
esac
exit 0`,
  );
  shim(bin, "sudo", `${record}\nexit 0`);
  shim(bin, "curl", `${record}\nexit ${opts.healthy === false ? 22 : 0}`);
  shim(bin, "sleep", "exit 0");
  const run = () =>
    execFileSync("bash", [join(VM_DIR, "autodeploy.sh")], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        APP_REPO: repo,
        BUILD_REPO: build,
        SCRAPE_ENV: join(root, "scrape.env"),
        APP_HEALTH: "http://127.0.0.1:1/api/health",
        BUILT_MARKER: join(repo, ".deployed.sha"),
      },
      encoding: "utf8",
    });
  const lines = () => readFileSync(log, "utf8").trim().split("\n");
  return { repo, build, run, lines };
}

test("autodeploy.sh builds in its own checkout while the app serves, and stops it only to swap .next in", () => {
  const vm = fakeVm();
  vm.run();
  const lines = vm.lines();
  const at = (re: RegExp) => lines.findIndex((l) => re.test(l));
  const build = at(/^npm run build$/);
  const migrate = at(/^npm run migrate$/);
  const stop = at(/^sudo systemctl stop sportsdb-app$/);
  const start = at(/^sudo systemctl start sportsdb-app$/);
  assert.ok(build >= 0 && migrate >= 0 && stop >= 0 && start >= 0, `steps missing in:\n${lines.join("\n")}`);
  assert.ok(migrate < build, "migrate runs before the build, as before");
  assert.ok(build < stop, "the build finishes before the app is stopped");
  assert.ok(stop < start, "the app is started again after the swap");
  assert.ok(!lines.slice(stop, start).some((l) => /^npm/.test(l)), "nothing slow runs while the app is down");
  // The build ran in the build checkout and its output now serves from the live checkout.
  assert.equal(readFileSync(join(vm.repo, ".next", "BUILD_ID"), "utf8").trim(), `built-in-${vm.build}`);
  assert.ok(!existsSync(join(vm.build, ".next")), "the build checkout no longer holds the .next it handed over");
  assert.equal(readFileSync(join(vm.repo, ".deployed.sha"), "utf8").trim(), "new-sha");
  // The lock did not change: the live node_modules stays, and no npm ci ran in the live checkout.
  assert.equal(readFileSync(join(vm.repo, "node_modules", ".installed-from"), "utf8"), "lock-v1");
  // The compiler cache stays with the build checkout for the next build; the live app starts its own.
  assert.equal(readFileSync(join(vm.build, ".next-cache", "compiler"), "utf8").trim(), "warm");
  assert.ok(!existsSync(join(vm.repo, ".next", "cache")), "the live .next starts without the build's cache");
  assert.ok(!existsSync(join(vm.repo, ".next.prev")), "the previous build is removed once the new one is healthy");
});

test("autodeploy.sh swaps the previous build back when the new one fails its health check", () => {
  const vm = fakeVm({ healthy: false });
  assert.throws(() => vm.run(), /did not answer/);
  const lines = vm.lines();
  assert.equal(lines.filter((l) => /^sudo systemctl start sportsdb-app$/.test(l)).length, 2, "started twice: the new build, then the old one again");
  assert.equal(readFileSync(join(vm.repo, ".next", "BUILD_ID"), "utf8").trim(), "old", "the previous build serves again");
  assert.equal(readFileSync(join(vm.repo, ".next.failed", "BUILD_ID"), "utf8").trim(), `built-in-${vm.build}`, "the rejected build is kept for a look");
  assert.equal(readFileSync(join(vm.repo, ".deployed.sha"), "utf8").trim(), "old-sha", "the marker still names the build that runs");
});

test("autodeploy.sh installs a changed package-lock in the build checkout and swaps node_modules in with the build", () => {
  const vm = fakeVm({ lockAfterFetch: "lock-v2" });
  vm.run();
  const lines = vm.lines();
  const ci = lines.findIndex((l) => /^npm ci/.test(l));
  const stop = lines.findIndex((l) => /^sudo systemctl stop sportsdb-app$/.test(l));
  assert.ok(ci >= 0 && ci < stop, "npm ci runs before the app is stopped");
  assert.equal(readFileSync(join(vm.repo, "node_modules", ".installed-from"), "utf8").trim(), "lock-v2");
  assert.equal(readFileSync(join(vm.repo, ".next", "BUILD_ID"), "utf8").trim(), `built-in-${vm.build}`);
});
