import Link from "next/link";
import { LEAGUE_LABEL, SOCCER_LEAGUES, hasStandings, type League } from "@/lib/queries";
import { LogoMark } from "./Logo";

const LEAGUE_SECTIONS: { label: string; suffix: string }[] = [
  { label: "Scores", suffix: "" },
  { label: "Standings", suffix: "/standings" },
  { label: "Teams", suffix: "/teams" },
  { label: "Leaders", suffix: "/leaders" },
  { label: "News", suffix: "/news" },
];

function Column({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-faint)]">{title}</h3>
      <ul className="flex flex-col gap-1.5">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-[var(--text-muted)] transition hover:text-[var(--accent)]">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function leagueLinks(league: League) {
  return LEAGUE_SECTIONS.filter((s) => s.suffix !== "/standings" || hasStandings(league)).map((s) => ({ label: s.label, href: `/${league}${s.suffix}` }));
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="container-x flex flex-col gap-8 py-10">
        <div className="flex flex-col gap-3">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
            <LogoMark size={26} />
            SportsDB
          </Link>
          <p className="max-w-lg text-sm leading-relaxed text-[var(--text-muted)]">
            Live scores, standings and player stats for football, the NFL, NBA, cricket, tennis and F1, with ten years of history for every team
            and player.
          </p>
        </div>
        {/* Seven columns of similar depth, so no one sport runs the page long. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
          <Column title="Football" links={SOCCER_LEAGUES.map((l) => ({ label: LEAGUE_LABEL[l], href: `/${l}` }))} />
          <Column title="NFL" links={leagueLinks("nfl")} />
          <Column title="NBA" links={leagueLinks("nba")} />
          <Column
            title="Cricket"
            links={[
              { label: "All series & live", href: "/cricket/series" },
              { label: "IPL", href: "/ipl" },
              { label: "Big Bash", href: "/bbl" },
              { label: "World Cup", href: "/cwc" },
              { label: "T20 World Cup", href: "/t20wc" },
              { label: "ODIs", href: "/odi" },
              { label: "T20Is", href: "/t20i" },
            ]}
          />
          <Column
            title="Women's cricket"
            links={[
              { label: "WPL", href: "/wpl" },
              { label: "Big Bash", href: "/wbbl" },
              { label: "World Cup", href: "/wcwc" },
              { label: "T20 World Cup", href: "/wt20wc" },
              { label: "ODIs", href: "/wodi" },
              { label: "T20Is", href: "/wt20i" },
            ]}
          />
          <Column
            title="Tennis"
            links={[
              { label: "Scores", href: "/tennis" },
              { label: "Calendar", href: "/tennis/tournaments" },
              { label: "ATP rankings", href: "/tennis/atp" },
              { label: "WTA rankings", href: "/tennis/wta" },
            ]}
          />
          <Column
            title="F1 & more"
            links={[
              { label: "F1 Calendar", href: "/f1" },
              { label: "F1 Standings", href: "/f1/standings" },
              { label: "Top Games", href: "/top-games" },
              { label: "Search", href: "/search" },
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Terms of Use", href: "/terms" },
            ]}
          />
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <div className="container-x flex flex-col gap-2 py-4 text-xs text-[var(--text-faint)]">
          <p>
            © {new Date().getFullYear()} SportsDB. An independent site, not affiliated with or endorsed by any league, club, player, broadcaster, betting
            operator or data provider. Team names, crests and logos are the property of their respective owners and appear for identification only.
          </p>
          <p>
            Data is compiled from public sources and refreshed automatically; it may contain errors and is not an official record. Projections are
            statistical estimates, not forecasts, and nothing here is betting advice. <Link href="/privacy" className="hover:text-[var(--accent)]">Privacy</Link> ·{" "}
            <Link href="/terms" className="hover:text-[var(--accent)]">Terms</Link>
          </p>
          <p>
            ODI and T20 international results and scorecards are derived from ball-by-ball data published by{" "}
            <a href="https://cricsheet.org" className="hover:text-[var(--accent)]" rel="noopener">Cricsheet</a>, used under its attribution licence. Some player photographs come from{" "}
            <a href="https://commons.wikimedia.org" className="hover:text-[var(--accent)]" rel="noopener">Wikimedia Commons</a> under Creative Commons licences; each player page credits the photographer.
          </p>
        </div>
      </div>
    </footer>
  );
}
