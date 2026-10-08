import Link from "next/link";
import { SectionHeader } from "@/components/SectionHeader";
import { getBestOfWeek } from "@/lib/bestOfWeekData";
import { ageLabel, bestChips, chipKey, competitionLabel, type BestFact } from "@/lib/bestOfWeek";
import { BestRail, type BestItem } from "./BestRail";

// Module 5 of the first visit: the standout performances of the last seven days, across sports (rules in
// lib/bestOfWeek.ts). Every card links to the page that shows the same figure. The same server HTML for everyone, every
// card and link included; the sport chips and the Follow buttons are a client island (BestRail) that only hides or
// follows, it never changes a card's claim. Shown only to a visitor with no saved setup (.home-firstvisit is hidden under
// html[data-home="built"|"collapsed"]). With nothing that clears a bar there is nothing to say, so the section is left out.

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
  const items: BestItem[] = facts.map((fact) => ({
    id: fact.id,
    chip: chipKey(fact),
    follow: fact.follow ?? null,
    card: (
      <Link href={fact.href} className="bw-link">
        <span className="bw-meta">
          <span className="bw-comp">{competitionLabel(fact)}</span>
          <span className="bw-age">{ageLabel(fact.at, now)}</span>
        </span>
        <span className="bw-text">
          <Sentence fact={fact} />
        </span>
        {fact.note && <span className="bw-note">{fact.note}</span>}
      </Link>
    ),
  }));
  return (
    <section className="home-firstvisit" data-module="best-of-week" aria-labelledby="home-best-of-week">
      <SectionHeader plain description="From results stored in the last seven days. Each card links to the page with the figure.">
        <span id="home-best-of-week">The best of this week</span>
      </SectionHeader>
      <BestRail chips={bestChips(facts)} items={items} />
    </section>
  );
}
