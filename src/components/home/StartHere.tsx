"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LADDER } from "@/lib/homeLadder";
import { writeDeclined } from "@/lib/homeSetup";
import { isSportPick, PICKED_EVENT, PICK_TOGGLE_EVENT, SPORT_PICKS, SPORT_PICK_LABEL, type SportPick } from "@/lib/sportPicks";
import type { SportLines } from "./SportPicker";
import { Glyph } from "./Glyph";

// "Start here": one card per sport with its best pages as plain links (in the server HTML, so crawlers and visitors
// who will not pick still have somewhere to go), and a button that adds the sport to the picker above. The picker owns
// the picks; this only asks it to toggle and shows what it reports back.
export function StartHere({ lines }: { lines: SportLines }) {
  const [picked, setPicked] = useState<SportPick[]>([]);

  useEffect(() => {
    const onPicked = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      setPicked(Array.isArray(detail) ? detail.filter((s): s is SportPick => typeof s === "string" && isSportPick(s)) : []);
    };
    window.addEventListener(PICKED_EVENT, onPicked);
    return () => window.removeEventListener(PICKED_EVENT, onPicked);
  }, []);

  const toggle = (sport: SportPick) => window.dispatchEvent(new CustomEvent(PICK_TOGGLE_EVENT, { detail: sport }));

  return (
    <div className="hx-ladder">
      {SPORT_PICKS.map((sport) => {
        const on = picked.includes(sport);
        const line = lines[sport];
        return (
          <article key={sport} className="card hx-lad">
            <h3>
              <span className="pk-ib">
                <Glyph name={sport} />
              </span>
              {SPORT_PICK_LABEL[sport]}
            </h3>
            <p className="hx-lad-line">
              {line.live > 0 && <span className="hx-livedot" aria-hidden />}
              {line.text}
            </p>
            <ul>
              {LADDER[sport].map((page) => (
                <li key={page.href}>
                  <Link href={page.href}>{page.label}</Link>
                </li>
              ))}
            </ul>
            <button type="button" className="hx-add" aria-pressed={on} onClick={() => toggle(sport)}>
              {on ? "✓ On your page" : `+ Add ${SPORT_PICK_LABEL[sport]}`}
            </button>
          </article>
        );
      })}
      <button type="button" className="card hx-lad hx-lad-any" onClick={writeDeclined}>
        <h3>
          <span className="pk-ib">
            <Glyph name="all" />
          </span>
          Everything
        </h3>
        <p className="hx-lad-line">Ranked by importance, not by sport</p>
        <span className="hx-lad-go">Just show me everything →</span>
      </button>
    </div>
  );
}

/** "Start picking" in How it works: back up to the picker band. */
export function ScrollToPicker({ children }: { children: React.ReactNode }) {
  const go = () => {
    const band = document.querySelector(".home-builder-hero");
    band?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  return (
    <button type="button" className="hx-add hx-start btn-lift" onClick={go}>
      {children}
    </button>
  );
}
