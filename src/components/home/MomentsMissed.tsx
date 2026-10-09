"use client";

import Link from "next/link";
import { prefetchFor } from "@/lib/prefetch";
import { useEffect, useState } from "react";
import { LocalTime } from "@/components/LocalTime";
import type { BlockResponse, HomeBlock, Moment, MomentsBlockData } from "@/lib/blockTypes";
import { LEAGUE_LABEL, isLeague } from "@/lib/leagues";
import { followedTeams, markVisit, momentsUrl, safeStorage, sinceForVisit } from "@/lib/momentsSeen";

// "Moments you missed": for a visitor who comes back, the finished results of the teams on their page since
// they last looked (a week at most), newest first. Hidden on a first visit, with no team block, when nothing
// finished, and when the request fails. The last-visit time is written once the answer has arrived and the
// block has been given its chance to render, so a failed request is retried at the next visit.

/** The catch-up ring: a navy disc with a lime arc for the share of the moments listed here, and their number in the middle. */
export function CatchUpRing({ shown, total }: { shown: number; total: number }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, shown / total) : 0;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`Showing ${shown} of ${total} results`} className="shrink-0">
      <circle cx="28" cy="28" r="28" fill="var(--navy)" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="4" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--volt)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 28 28)" />
      <text x="28" y="34" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="800" style={{ fontFamily: "var(--font-display)" }}>
        {shown}
      </text>
    </svg>
  );
}

function leagueName(league: string): string {
  return league === "cricket" ? "Cricket" : isLeague(league) ? LEAGUE_LABEL[league] : league;
}

function Row({ m }: { m: Moment }) {
  const headline = m.summary ?? `${m.team} ${m.score} ${m.opponent}`;
  return (
    <Link prefetch={prefetchFor(m.href)} href={m.href} className="flex items-center gap-3 py-2.5 hover:text-[var(--sig-ink)]">
      <span className={`result-badge result-${m.result.toLowerCase()}`} aria-label={m.result === "W" ? "Win" : m.result === "L" ? "Loss" : "Draw"}>
        {m.result}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{headline}</span>
        <span className="block truncate text-[12px] text-[var(--text-muted)]">
          {leagueName(m.league)}
          {m.summary ? (m.score ? ` · ${m.team} ${m.score} ${m.opponent}` : ` · ${m.team}`) : ` · ${m.home ? "Home" : "Away"}`} · <LocalTime iso={m.date} format="date" />
        </span>
      </span>
      <span aria-hidden="true" className="text-[var(--text-faint)]">→</span>
    </Link>
  );
}

export function MomentsMissed({ blocks }: { blocks: HomeBlock[] }) {
  const teams = followedTeams(blocks);
  const [result, setResult] = useState<{ teams: string; requested: number; at: number; data: MomentsBlockData | null } | null>(null);

  useEffect(() => {
    const local = safeStorage("localStorage");
    const session = safeStorage("sessionStorage");
    const now = Date.now();
    const since = sinceForVisit(local, session, now);
    if (since === null || !teams) {
      markVisit(local, session, now);
      return;
    }
    let live = true;
    fetch(momentsUrl(teams, since))
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<BlockResponse>;
      })
      .then((body) => {
        if (live) setResult({ teams, requested: since, at: now, data: body.block as MomentsBlockData | null });
      })
      .catch(() => {
        /* nothing is drawn and the last visit is left as it was */
      });
    return () => {
      live = false;
    };
  }, [teams]);

  // After the block has rendered (this effect runs once the result is on screen), move the last visit forward.
  useEffect(() => {
    if (result) markVisit(safeStorage("localStorage"), safeStorage("sessionStorage"), result.at);
  }, [result]);

  const data = result && result.teams === teams ? result.data : null;
  if (!data || data.moments.length === 0) return null;
  const capped = new Date(data.since).getTime() > result!.requested + 1000;

  return (
    <section aria-label="Moments you missed" className="card p-4">
      <header className="flex items-center gap-3">
        <CatchUpRing shown={data.moments.length} total={data.total} />
        <div className="min-w-0">
          <h2 className="display text-[22px] text-[var(--text)]">Moments you missed</h2>
          <p className="text-[12px] font-semibold text-[var(--text-muted)]">
            {capped ? "In the last 7 days" : "Since your last visit"} · showing {data.moments.length} of {data.total} {data.total === 1 ? "result" : "results"}
          </p>
        </div>
      </header>
      <div className="mt-2 divide-y divide-[var(--border)]">
        {data.moments.map((m) => (
          <Row key={m.id} m={m} />
        ))}
      </div>
    </section>
  );
}
