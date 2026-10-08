import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import { SectionHeader } from "@/components/SectionHeader";
import { cricketArchiveLine, HOW_NOTE, HOW_STEPS, showcaseTiles, trustItems, type ExplainerExamples, type ShowcaseVisual } from "@/lib/homeExplainers";
import type { NewestResult } from "@/lib/homeExplainersData";
import { ScrollToPicker, StartHere } from "./StartHere";
import type { SportLines } from "./SportPicker";

// Modules 8 to 11 of the first-visit page: what the site does (showcase), how a page gets built, why to trust the
// numbers, and a ladder for visitors who will not pick. Server components, the same HTML for everyone and refreshed with
// the page; only the "+ Add" buttons are client code (StartHere). Each section carries `home-firstvisit`, which globals.css
// hides for a visitor with a saved setup. No heading here is an h1: the picker band owns it.

// Drawn shapes, never figures: a number in a picture would be a claim nobody checked.
const VISUAL: Record<ShowcaseVisual, React.ReactNode> = {
  story: (
    <svg viewBox="0 0 320 90" preserveAspectRatio="none" aria-hidden>
      <polyline stroke="var(--text-faint)" strokeWidth="2" strokeDasharray="4 4" fill="none" points="0,86 40,74 80,66 120,56 160,50 200,38 240,30 280,18 320,8" />
      <polyline stroke="var(--sig)" strokeWidth="3" fill="none" points="0,86 40,78 80,64 120,60 160,44 200,40 240,26 280,22 320,12" />
    </svg>
  ),
  splits: (
    <div className="hx-bars" aria-hidden>
      <i style={{ width: "88%" }} />
      <i style={{ width: "62%" }} />
      <i style={{ width: "74%" }} />
    </div>
  ),
  compare: (
    <div className="hx-vs" aria-hidden>
      <div>
        <i style={{ width: "86%" }} />
        <i style={{ width: "60%" }} />
      </div>
      <div>
        <i style={{ width: "58%" }} />
        <i style={{ width: "90%" }} />
      </div>
    </div>
  ),
  cards: (
    <div className="hx-posters" aria-hidden>
      <span />
      <span />
      <span />
    </div>
  ),
  calendar: (
    <div className="hx-cal" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <i key={i} className={[1, 3, 8, 10, 12].includes(i) ? "on" : ""} />
      ))}
    </div>
  ),
  records: (
    <div className="hx-rec" aria-hidden>
      <i style={{ height: "40%" }} />
      <i style={{ height: "62%" }} />
      <i style={{ height: "48%" }} />
      <i style={{ height: "100%" }} />
      <i style={{ height: "70%" }} />
    </div>
  ),
};

/** The modules for given inputs; split from the loader so a test can render any state. */
export function HomeExplainersView({ lines, examples, newest }: { lines: SportLines; examples: ExplainerExamples; newest: NewestResult | null }) {
  const tiles = showcaseTiles(examples);
  const archive = cricketArchiveLine();

  return (
    <>
      <section className="home-firstvisit" data-module="showcase" aria-labelledby="hx-showcase">
        <SectionHeader description="Things a plain scores app does not give you">
          <span id="hx-showcase">Built from every result we store</span>
        </SectionHeader>
        <div className="hx-show">
          {tiles.map((t) => (
            <article key={t.id} className="card hx-sh">
              <div className={`hx-vis hx-vis-${t.id}`}>{VISUAL[t.id]}</div>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              <Link href={t.link.href}>{t.link.label} →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="home-firstvisit" data-module="how-it-works" aria-labelledby="hx-how">
        <SectionHeader description="Three steps, no account">
          <span id="hx-how">How it works</span>
        </SectionHeader>
        <div className="hx-how">
          {HOW_STEPS.map((s) => (
            <article key={s.n} className="card hx-step">
              <span className="hx-n" aria-hidden>
                {s.n}
              </span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                {s.n === 1 && <ScrollToPicker>Start picking ↑</ScrollToPicker>}
              </div>
            </article>
          ))}
        </div>
        <p className="hx-note">{HOW_NOTE}</p>
      </section>

      <section className="home-firstvisit" data-module="trust" aria-labelledby="hx-trust">
        <SectionHeader>
          <span id="hx-trust">Where the numbers come from</span>
        </SectionHeader>
        <div className="hx-trust">
          {trustItems().map((t) => (
            <div key={t.id} className="card hx-tr">
              <h3>{t.title}</h3>
              <p>{t.text}</p>
              {t.id === "fresh" && newest && (
                <p className="hx-stamp">
                  Newest result stored: {newest.leagueLabel}, started <LocalTime iso={newest.startedIso} format="datetime" serverTimeZone="UTC" showZone />
                </p>
              )}
              <Link href={t.link.href}>{t.link.label} →</Link>
            </div>
          ))}
        </div>
        {archive && <p className="hx-note">{archive}</p>}
      </section>

      <section className="home-firstvisit" data-module="start-here" aria-labelledby="hx-start">
        <SectionHeader description="Not ready to pick? The best pages in every sport.">
          <span id="hx-start">Start here</span>
        </SectionHeader>
        <StartHere lines={lines} />
      </section>
    </>
  );
}
