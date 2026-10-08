import Link from "next/link";
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
      <h2 id="home-three-lines" className="text-[21px] font-extrabold leading-tight tracking-tight text-[var(--text)]">
        Today in three lines
        <small className="mt-0.5 block text-xs font-bold tracking-normal text-[var(--text-muted)]">From results stored in the last two days. Each line links to the page with the figure.</small>
      </h2>
      <ol className="card mt-3 divide-y divide-[var(--border)] overflow-hidden">
        {lines.map((fact, i) => (
          <li key={fact.id}>
            <Link href={fact.href} className="grid grid-cols-[28px_1fr] items-baseline gap-2.5 px-4 py-3 text-sm font-semibold text-[var(--text)] hover:bg-[var(--sig-soft)]">
              <span aria-hidden className="text-xl font-extrabold tracking-tight text-[var(--sig-ink)]">
                {i + 1}
              </span>
              <span className="min-w-0 break-words">
                <Line fact={fact} />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
