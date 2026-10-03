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

test("autodeploy.sh deploys only when origin/main moved, and clears NODE_ENV", () => {
  const src = readFileSync(join(VM_DIR, "autodeploy.sh"), "utf8");
  assert.match(src, /git fetch/);
  assert.match(src, /origin\/main/);
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
