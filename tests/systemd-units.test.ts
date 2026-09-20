import { test } from "node:test";
import assert from "node:assert/strict";
import { accessSync, constants, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Static checks only: the units are never loaded into systemd here and install.sh / scrape.sh are never run.
const VM_DIR = resolve(process.cwd(), "deploy/vm");
const UNIT_DIR = join(VM_DIR, "systemd");
const INSTALL_ROOT = "/opt/sportsdb/scrapers";

type Unit = Record<string, Record<string, string[]>>;

function parseUnit(file: string): Unit {
  const unit: Unit = {};
  let section = "";
  for (const raw of readFileSync(join(UNIT_DIR, file), "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      section = header[1];
      unit[section] ??= {};
      continue;
    }
    const eq = line.indexOf("=");
    assert.ok(section && eq > 0, `${file}: unparseable line "${line}"`);
    const key = line.slice(0, eq).trim();
    (unit[section][key] ??= []).push(line.slice(eq + 1).trim());
  }
  return unit;
}

function single(unit: Unit, section: string, key: string): string {
  const values = unit[section]?.[key];
  assert.ok(values, `missing ${section}/${key}`);
  assert.equal(values.length, 1, `${section}/${key} set more than once`);
  return values[0];
}

const TIMERS = [
  { job: "tick", onCalendar: "*:0/15", persistent: false },
  { job: "daily", onCalendar: "*-*-* 06:07:00 UTC", persistent: true },
  { job: "hourly", onCalendar: "*-*-* *:22:00", persistent: false },
];

for (const { job, onCalendar, persistent } of TIMERS) {
  test(`${job} timer triggers ${job} at the expected time`, () => {
    const timer = parseUnit(`sportsdb-scrape-${job}.timer`);
    assert.equal(single(timer, "Timer", "Unit"), `sportsdb-scrape@${job}.service`);
    assert.equal(single(timer, "Timer", "OnCalendar"), onCalendar);
    assert.equal(single(timer, "Install", "WantedBy"), "timers.target");
    if (persistent) assert.equal(single(timer, "Timer", "Persistent"), "true");
    else assert.equal(timer.Timer.Persistent, undefined, "only the daily timer catches up missed runs");
  });
}

test("service template is a oneshot run as ubuntu with a mandatory env file", () => {
  const svc = parseUnit("sportsdb-scrape@.service");
  assert.equal(single(svc, "Service", "Type"), "oneshot");
  assert.equal(single(svc, "Service", "User"), "ubuntu");
  assert.equal(single(svc, "Service", "WorkingDirectory"), INSTALL_ROOT);
  // No leading "-": a missing env file must fail the unit loudly instead of running unconfigured.
  assert.equal(single(svc, "Service", "EnvironmentFile"), "/opt/sportsdb/scrape.env");
  assert.equal(single(svc, "Service", "TimeoutStartSec"), "4h");
});

test("service serialises all jobs on one lock and runs scrape.sh with the instance name", () => {
  const svc = parseUnit("sportsdb-scrape@.service");
  const exec = single(svc, "Service", "ExecStart");
  // The lock path directly follows flock, so there are no -n / -w flags: a job waits its turn instead of skipping or timing out.
  assert.equal(exec, `/usr/bin/flock /run/lock/sportsdb-scrape.lock ${INSTALL_ROOT}/deploy/vm/scrape.sh %i`);
});

test("service leaves scope and NODE_ENV to scrape.sh and the env file", () => {
  const svc = parseUnit("sportsdb-scrape@.service");
  const serviceKeys = Object.keys(svc.Service);
  assert.ok(!serviceKeys.includes("Environment"), "no inline Environment=");
  const text = JSON.stringify(svc);
  for (const name of ["NODE_ENV", "SCRAPE_LEAGUES", "SCRAPE_MODE"]) {
    assert.ok(!text.includes(name), `${name} must not be set by the unit`);
  }
});

test("the ExecStart script exists in the repo and is executable", () => {
  const exec = single(parseUnit("sportsdb-scrape@.service"), "Service", "ExecStart");
  const script = exec.split(" ").find((part) => part.startsWith(`${INSTALL_ROOT}/`));
  assert.ok(script, "ExecStart must reference a path under the checkout");
  const relative = script.slice(INSTALL_ROOT.length + 1);
  assert.equal(relative, "deploy/vm/scrape.sh");
  accessSync(resolve(process.cwd(), relative), constants.X_OK);
});

test("install.sh is executable and installs and enables the service and all three timers", () => {
  const path = join(VM_DIR, "install.sh");
  accessSync(path, constants.X_OK);
  const script = readFileSync(path, "utf8");
  assert.match(script, /^#!\/usr\/bin\/env bash/);
  assert.match(script, /^install -m 644 .*systemd\/sportsdb-scrape@\.service .*systemd\/sportsdb-scrape-\*\.timer /m);
  const enable = /^systemctl enable --now (.+)$/m.exec(script);
  assert.ok(enable, "install.sh must enable the timers");
  assert.deepEqual(
    enable[1].trim().split(/\s+/).sort(),
    TIMERS.map((t) => `sportsdb-scrape-${t.job}.timer`).sort()
  );
});
