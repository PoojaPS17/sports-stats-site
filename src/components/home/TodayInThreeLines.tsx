import { SectionHeader } from "@/components/SectionHeader";
import Link from "next/link";
import { prefetchFor } from "@/lib/prefetch";
import { getThreeLines } from "@/lib/threeLinesData";
import type { LineFact } from "@/lib/threeLines";

// "Today in three lines": up to three recent facts, each linked to the page that shows the same figure.
// The same server HTML for every visitor; CSS hides it once a visitor has a saved setup (.home-firstvisit,
// keyed on <html data-home>). With no fresh fact there is nothing to say, so the section is left out
// altogether: no heading over an empty box, and never a stale or generic line to fill the space.

/** `text` with its figure in bold. The figure is guaranteed to be inside `text` (selectLines checks). */
function Line({ fact }: { fact: LineFact }) {
  const i = fact.text.indexOf(fact.figure);
  return (
    <>
      {fact.text.slice(0, i)}
      <strong className="font-extrabold">{fact.figure}</strong>
      {fact.text.slice(i + fact.figure.length)}
    </>
  );
}

export async function TodayInThreeLines() {
  const lines = await getThreeLines();
  if (lines.length === 0) return null;
  return (
    <section className="home-firstvisit" aria-labelledby="home-three-lines">
      <SectionHeader plain description="From results stored in the last two days. Each line links to the page with the figure.">
        <span id="home-three-lines">Today in three lines</span>
      </SectionHeader>
      <ol className="card t3">
        {lines.map((fact, i) => (
          <li key={fact.id}>
            <Link prefetch={prefetchFor(fact.href)} href={fact.href} className="t3-line">
              <b aria-hidden>{i + 1}</b>
              <span>
                <Line fact={fact} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
