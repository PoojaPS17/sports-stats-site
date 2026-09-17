import Link from "next/link";
import { LEAGUE_LABEL, CRICKET_LEAGUES, SOCCER_LEAGUES, type League } from "@/lib/queries";
import { TOURS, TOUR_LABEL } from "@/lib/tennisTours";

const LEAGUE_SECTIONS: { label: string; suffix: string }[] = [
  { label: "Scores", suffix: "" },
  { label: "Standings", suffix: "/standings" },
  { label: "Teams", suffix: "/teams" },
  { label: "Leaders", suffix: "/leaders" },
  { label: "News", suffix: "/news" },
];

function LeagueColumn({ league }: { league: League }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text)]">{LEAGUE_LABEL[league]}</h3>
      <ul className="flex flex-col gap-1.5">
        {LEAGUE_SECTIONS.map((s) => (
          <li key={s.label}>
            <Link href={`/${league}${s.suffix}`} className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Cricket, Football (multi-league) and Tennis (a different page shape entirely — no
// standings/teams/leaders/news) get one flat list of leagues/tours per column instead
// of the 5-deep link list above, which only makes sense for a single league.
function GroupColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--text)]">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface-muted)]">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-8 px-4 py-10 sm:grid-cols-3 lg:grid-cols-7">
        <div className="col-span-2 flex flex-col gap-2 sm:col-span-3 lg:col-span-1">
          <span className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-[var(--accent-foreground)]">📊</span>
            ScoreDB
          </span>
          <p className="text-sm text-[var(--text-muted)]">
            Live scores, standings and player stats for football, the NFL, NBA, cricket, tennis and F1 — plus 10
            years of history for every team and player.
          </p>
        </div>
        <LeagueColumn league="nfl" />
        <LeagueColumn league="nba" />
        <GroupColumn title="Football" links={SOCCER_LEAGUES.map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` }))} />
        <GroupColumn title="Cricket" links={CRICKET_LEAGUES.map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` }))} />
        <GroupColumn title="Tennis" links={TOURS.map((t) => ({ label: TOUR_LABEL[t], href: `/tennis/${t}` }))} />
        <GroupColumn
          title="F1"
          links={[
            { label: "Calendar", href: "/f1" },
            { label: "Standings", href: "/f1/standings" },
          ]}
        />
      </div>
      <div className="border-t border-[var(--border)] px-4 py-4">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 text-xs text-[var(--text-muted)] sm:flex-row">
          <span>© {new Date().getFullYear()} ScoreDB. All scores and stats via ESPN, refreshed automatically.</span>
          <span>Not affiliated with the Premier League, La Liga, NFL, NBA, IPL, ATP, WTA, F1, or ESPN.</span>
        </div>
      </div>
    </footer>
  );
}
