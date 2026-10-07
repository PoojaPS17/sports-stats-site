import Link from "next/link";
import { pool } from "@/lib/db";
import { LEAGUE_LABEL, isLeague } from "@/lib/queries";
import { MAX_AGE_MINUTES } from "../../../scripts/lib/heartbeat";
import { pageMeta } from "@/lib/metadata";
import { LegalPage } from "@/components/LegalPage";

// Rendered from the database, so it must not freeze at the edge: five minutes matches the other short-lived pages.
export const revalidate = 300;

export const metadata = pageMeta(
  "Data status: how fresh each league is",
  "The age of the newest result for every league and whether the live and daily updates are running on time.",
  "/status"
);

interface LeagueRow {
  league: string;
  newest_completed: Date | null;
  next_scheduled: Date | null;
  completed_7d: string;
}

function ago(when: Date | null): string {
  if (!when) return "none yet";
  const hours = (Date.now() - when.getTime()) / 3_600_000;
  if (hours < 1) return "under an hour ago";
  if (hours < 48) return `${Math.round(hours)} hours ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function day(when: Date | null): string {
  return when ? when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "none scheduled";
}

// Friendly names for the two jobs a visitor cares about; the rest of the heartbeat table is plumbing.
const JOBS: { scraper: string; label: string }[] = [
  { scraper: "scrape-tick", label: "Live scores and results" },
  { scraper: "scrape-daily", label: "Daily pass (standings, rosters, season totals)" },
];

export default async function StatusPage() {
  const [{ rows: leagues }, { rows: runs }] = await Promise.all([
    pool.query<LeagueRow>(
      `select league,
              max(date) filter (where completed) as newest_completed,
              min(date) filter (where not completed and date > now()) as next_scheduled,
              count(*) filter (where completed and date > now() - interval '7 days') as completed_7d
       from games group by league order by league`
    ),
    pool.query<{ scraper: string; age: string }>(`select scraper, extract(epoch from (now() - last_ok_at)) / 60 as age from scrape_runs`),
  ]);
  const ages = new Map(runs.map((r) => [r.scraper, Number(r.age)]));

  return (
    <LegalPage title="Data status" subtitle="How fresh the data is right now. This page refreshes every five minutes.">
      <h2>Updates</h2>
      <ul>
        {JOBS.map(({ scraper, label }) => {
          const age = ages.get(scraper);
          const limit = MAX_AGE_MINUTES[scraper];
          const late = age === undefined || age > limit;
          return (
            <li key={scraper}>
              <strong>{label}:</strong> {late ? "running late" : "on time"}
              {age !== undefined && <> (last success {age < 60 ? `${Math.round(age)} minutes` : `${Math.round(age / 60)} hours`} ago)</>}
            </li>
          );
        })}
      </ul>

      <h2>Newest result by league</h2>
      <p>
        A league with no result in the last few days is usually between matches, on a break or out of season, not stuck. The next scheduled
        fixture is shown alongside.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="py-2 pr-4 font-semibold">League</th>
              <th className="py-2 pr-4 font-semibold">Newest result</th>
              <th className="py-2 pr-4 font-semibold">Next fixture</th>
              <th className="py-2 font-semibold">Results, last 7 days</th>
            </tr>
          </thead>
          <tbody>
            {leagues.map((l) => (
              <tr key={l.league} className="border-b border-[var(--border)]">
                <td className="py-2 pr-4">
                  {isLeague(l.league) ? <Link href={`/${l.league}`}>{LEAGUE_LABEL[l.league]}</Link> : l.league}
                </td>
                <td className="py-2 pr-4">{ago(l.newest_completed)}</td>
                <td className="py-2 pr-4">{day(l.next_scheduled)}</td>
                <td className="py-2">{Number(l.completed_7d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        How the data is gathered and counted is on the <Link href="/methodology">methodology page</Link>.
      </p>
    </LegalPage>
  );
}
