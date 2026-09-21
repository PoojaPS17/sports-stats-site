import { test } from "node:test";
import assert from "node:assert/strict";
import { f1ConstructorEspnName, f1TeamLabel } from "../src/lib/f1Names";

// ESPN gives every season the team's CURRENT name in vehicle.manufacturer (Renault 2016-20 reads "Alpine", Toro Rosso
// 2016-19 reads "AlphaTauri"); the reference site uses the name the team raced under. The stored value is kept and the label
// is applied for display only.

test("f1TeamLabel: Red Bull and Haas carry their full names in every season", () => {
  for (const season of [2016, 2021, 2026]) {
    assert.equal(f1TeamLabel(season, "Red Bull"), "Red Bull Racing");
    assert.equal(f1TeamLabel(season, "Haas"), "Haas F1 Team");
  }
});

test("f1TeamLabel: Renault 2016-20, then Alpine", () => {
  assert.equal(f1TeamLabel(2016, "Alpine"), "Renault");
  assert.equal(f1TeamLabel(2020, "Alpine"), "Renault");
  assert.equal(f1TeamLabel(2021, "Alpine"), "Alpine");
  assert.equal(f1TeamLabel(2025, "Alpine"), "Alpine");
});

test("f1TeamLabel: Toro Rosso 2016-19, then AlphaTauri", () => {
  assert.equal(f1TeamLabel(2016, "AlphaTauri"), "Toro Rosso");
  assert.equal(f1TeamLabel(2019, "AlphaTauri"), "Toro Rosso");
  assert.equal(f1TeamLabel(2020, "AlphaTauri"), "AlphaTauri");
  assert.equal(f1TeamLabel(2023, "AlphaTauri"), "AlphaTauri");
});

test("f1TeamLabel: Sauber 2016-18, Alfa Romeo Racing 2019-20, Alfa Romeo 2021-23, Kick Sauber 2024-25", () => {
  assert.equal(f1TeamLabel(2017, "Sauber"), "Sauber");
  assert.equal(f1TeamLabel(2019, "Alfa Romeo"), "Alfa Romeo Racing");
  assert.equal(f1TeamLabel(2020, "Alfa Romeo"), "Alfa Romeo Racing");
  assert.equal(f1TeamLabel(2022, "Alfa Romeo"), "Alfa Romeo");
  assert.equal(f1TeamLabel(2024, "Sauber"), "Kick Sauber");
  assert.equal(f1TeamLabel(2025, "Sauber"), "Kick Sauber");
});

// Checked against Wikipedia's season pages (constructors' standings): 2018 "Force India" (the Racing Point Force India entry, ESPN's
// "Racing Point"), 2016 "Manor", 2024 "RB" (the Visa Cash App RB team), 2025-26 "Racing Bulls".
test("f1TeamLabel: Force India in 2018 (ESPN says Racing Point), Racing Point 2019-20; RB in 2024, Racing Bulls otherwise", () => {
  assert.equal(f1TeamLabel(2018, "Racing Point"), "Force India");
  assert.equal(f1TeamLabel(2019, "Racing Point"), "Racing Point");
  assert.equal(f1TeamLabel(2020, "Racing Point"), "Racing Point");
  assert.equal(f1TeamLabel(2024, "Racing Bulls"), "RB");
  assert.equal(f1TeamLabel(2025, "Racing Bulls"), "Racing Bulls");
  assert.equal(f1TeamLabel(2026, "Racing Bulls"), "Racing Bulls");
  assert.equal(f1TeamLabel(2016, "Manor"), "Manor");
});

test("f1TeamLabel: other names pass through", () => {
  assert.equal(f1TeamLabel(2025, "McLaren"), "McLaren");
  assert.equal(f1TeamLabel(2018, "Force India"), "Force India");
  assert.equal(f1TeamLabel(2026, "Audi"), "Audi");
});

test("f1TeamLabel: a driver with no team in 2024-25 is a Sauber driver (ESPN's vehicle has no manufacturer for them)", () => {
  assert.equal(f1TeamLabel(2024, null), "Kick Sauber");
  assert.equal(f1TeamLabel(2025, null), "Kick Sauber");
  assert.equal(f1TeamLabel(2023, null), null);
  assert.equal(f1TeamLabel(2026, null), null);
});

test("f1ConstructorEspnName: the standings entry's manufacturer id gives that season's name, current or not", () => {
  assert.equal(f1ConstructorEspnName("106925", 2025), "Sauber");
  assert.equal(f1ConstructorEspnName("106846", 2016), "Force India");
  assert.equal(f1ConstructorEspnName("111838000", 2019), "Racing Point");
  assert.equal(f1ConstructorEspnName("111432", 2016), "Manor");
  assert.equal(f1ConstructorEspnName("106952", 2016), "AlphaTauri");
  // one ESPN id, two companies: Sauber (2016-18) became Alfa Romeo (2019-23)
  assert.equal(f1ConstructorEspnName("106792", 2017), "Sauber");
  assert.equal(f1ConstructorEspnName("106792", 2021), "Alfa Romeo");
  assert.equal(f1ConstructorEspnName("999", 2021), null);
});
