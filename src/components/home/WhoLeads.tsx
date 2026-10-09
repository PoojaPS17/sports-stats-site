import { SectionHeader } from "@/components/SectionHeader";
import Link from "next/link";
import { getWhoLeads } from "@/lib/whoLeadsData";
import type { LeaderEntry } from "@/lib/whoLeads";

// Module 6 of the first visit: who is top of the leader boards right now, for each competition in season (rules in
// lib/whoLeads.ts). The boards are the Leaders pages' own, so each name and figure is on the page the card links to.
// The same server HTML for everyone; shown only to a visitor with no saved setup. With no competition in season the
// section is left out altogether.

function Who({ entry, league }: { entry: LeaderEntry; league: string }) {
  const [first, second] = entry.people;
  const link = (p: { name: string; slug: string }) => (
    <Link prefetch={false} href={`/${league}/players/${p.slug}`} className="font-bold text-[var(--text)] hover:text-[var(--accent)] hover:underline">
      {p.name}
    </Link>
  );
  return (
    <>
      {link(first)}
      {second && (
        <>
          {" and "}
          {link(second)}
        </>
      )}
      {entry.moreLevel ? <span className="text-[var(--text-muted)]">{second ? " and others, level" : ", level"}</span> : second ? <span className="text-[var(--text-muted)]"> (level)</span> : null}
    </>
  );
}

export async function WhoLeads() {
  const leagues = await getWhoLeads();
  if (leagues.length === 0) return null;
  return (
    <section className="home-firstvisit" data-module="who-leads" aria-labelledby="home-who-leads">
      <SectionHeader plain description="Top of the leader boards in each competition now in season. Totals are from results stored on this site.">
        <span id="home-who-leads">Who leads</span>
      </SectionHeader>
      <div className="wl-grid">
        {leagues.map((l) => (
          <article key={l.league} className="wl-card card">
            <header className="wl-head">
              <h3>{l.leagueLabel}</h3>
              <span>{l.seasonLabel}</span>
            </header>
            <dl className="wl-list">
              {l.entries.map((e) => (
                <div key={e.label} className="wl-row">
                  <dt>{e.label}</dt>
                  <dd>
                    <span className="wl-fig">
                      {e.figure}
                      <small>{e.unit}</small>
                    </span>
                    <span className="wl-who">
                      <Who entry={e} league={l.league} />
                      {e.people.length === 1 && e.people[0].team && <span className="wl-team"> · {e.people[0].team}</span>}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <Link href={`/${l.league}/leaders`} className="wl-all">
              All {l.leagueLabel} leaders
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
