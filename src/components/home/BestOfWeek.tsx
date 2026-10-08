import Link from "next/link";
import { getBestOfWeek } from "@/lib/bestOfWeekData";
import { ageLabel, competitionLabel, type BestFact } from "@/lib/bestOfWeek";

// Module 5 of the first visit: the standout performances of the last seven days, across sports (rules in
// lib/bestOfWeek.ts). Every card links to the page that shows the same figure. The same server HTML for everyone;
// shown only to a visitor with no saved setup (.home-firstvisit is hidden under html[data-home="built"|"collapsed"]).
// With nothing that clears a bar there is nothing to say, so the section is left out altogether.

function Sentence({ fact }: { fact: BestFact }) {
  const i = fact.text.indexOf(fact.figure);
  return (
    <>
      {fact.text.slice(0, i)}
      <strong className="font-extrabold">{fact.figure}</strong>
      {fact.text.slice(i + fact.figure.length)}
    </>
  );
}

export async function BestOfWeek() {
  const now = new Date();
  const facts = await getBestOfWeek(now);
  if (facts.length === 0) return null;
  return (
    <section className="home-firstvisit" data-module="best-of-week" aria-labelledby="home-best-of-week">
      <h2 id="home-best-of-week" className="text-[21px] font-extrabold leading-tight tracking-tight text-[var(--text)]">
        Best of this week
        <small className="mt-0.5 block text-xs font-bold tracking-normal text-[var(--text-muted)]">From results stored in the last seven days. Each card links to the page with the figure.</small>
      </h2>
      <ul className="bw-grid mt-3">
        {facts.map((fact) => (
          <li key={fact.id}>
            <Link href={fact.href} className="bw-card card">
              <span className="bw-meta">
                <span className="bw-comp">{competitionLabel(fact)}</span>
                <span className="bw-age">{ageLabel(fact.at, now)}</span>
              </span>
              <span className="bw-text">
                <Sentence fact={fact} />
              </span>
              {fact.note && <span className="bw-note">{fact.note}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
