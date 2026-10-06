"use client";

import { useState } from "react";
import type { StoryInnings, StoryOver } from "@/lib/cricketBalls";
import { matchStoryModel } from "@/lib/cricketMatchStoryModel";
import { overNote } from "@/lib/cricketMatchExtras";
import { SectionHeader } from "@/components/SectionHeader";

/** Sides ESPN gives no colour: the signature colour, then the muted text colour. */
const FALLBACK = ["var(--sig)", "var(--text-muted)"];

function Disc({ symbol, extra, wicket }: { symbol: string; extra: string | null; wicket: boolean }) {
  const tone = wicket
    ? "bg-[var(--loss)] text-white"
    : symbol === "6"
      ? "bg-[var(--text)] text-[var(--surface)]"
      : symbol === "4"
        ? "bg-[var(--sig)] text-[var(--sig-on)]"
        : symbol === "0"
          ? "bg-[var(--surface-muted)] text-[var(--text-faint)]"
          : "bg-[var(--sig-soft)] text-[var(--text)]";
  return (
    <span className={`relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-[13px] font-extrabold tabular-nums ${tone}`}>
      {symbol}
      {extra && <span className="absolute -right-1 -top-1 rounded-full bg-[var(--surface)] px-1 text-[9px] font-bold uppercase leading-[14px] text-[var(--text-muted)] ring-1 ring-[var(--border)]">{extra}</span>}
    </span>
  );
}

function OverPanel({ over, innings, colour, number }: { over: StoryOver | undefined; innings: StoryInnings; colour: string; number: number }) {
  const summary = over ? `${over.runs} run${over.runs === 1 ? "" : "s"}${over.wickets ? `, ${over.wickets} wicket${over.wickets > 1 ? "s" : ""}` : ""}` : "not bowled";
  const chased = innings.target !== null && innings.total.runs >= innings.target;
  return (
    <div className="flex min-w-0 flex-1 basis-[280px] flex-col gap-2">
      <span className="eyebrow" style={{ color: colour }}>
        Over {number} · {innings.team} · {summary}
      </span>
      {over && (
        <div className="flex flex-wrap gap-1.5" aria-label={`Over ${number}, ${innings.team}: ${over.balls.map((b) => b.symbol).join(", ")}`}>
          {over.balls.map((b, i) => (
            <Disc key={i} symbol={b.symbol} extra={b.extra} wicket={b.wicket} />
          ))}
        </div>
      )}
      <span className="text-[13px] text-[var(--text-muted)]">{over ? overNote(over, innings) : chased ? `${innings.team} had already won.` : ""}</span>
    </div>
  );
}

/**
 * The match as a chart: the run worm or runs per over for every innings, wickets marked, and an
 * inspector under it showing the balls of one over. The first render on the server and on the
 * client are identical (state starts from the model's default over), so the page can still be cached.
 */
export function CricketMatchStory({ innings, colours }: { innings: StoryInnings[]; colours: Record<string, string> }) {
  const model = matchStoryModel(innings);
  const [view, setView] = useState<"worm" | "bars">("worm");
  const [over, setOver] = useState(model.defaultOver);
  if (innings.length === 0) return null;
  const colourOf = (teamId: string) => {
    const i = innings.findIndex((inn) => inn.teamId === teamId);
    return colours[teamId] ?? FALLBACK[Math.max(0, i) % FALLBACK.length];
  };
  const seg = (on: boolean) => `nav-pill text-[13px] ${on ? "nav-pill-active" : "text-[var(--text-muted)]"}`;
  const grid = view === "worm" ? model.wormGrid : model.barGrid;
  // The last over anyone bowled: where the inspector's Next button stops.
  const lastOver = Math.max(1, ...innings.map((inn) => inn.overs.length));

  return (
    <section className="flex flex-col" aria-label="Match story">
      <SectionHeader description="Over by over, from the ball-by-ball. Click an over to see its balls.">Match story</SectionHeader>
      <div className="card flex flex-col gap-3.5 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4 text-[13px] text-[var(--text-muted)]">
            {innings.map((inn) => (
              <span key={inn.period} className="flex items-center gap-1.5">
                <span className="h-1 w-3.5 rounded-sm" style={{ background: colourOf(inn.teamId) }} />
                {inn.team} {inn.total.wickets >= 10 ? `${inn.total.runs} all out` : `${inn.total.runs}/${inn.total.wickets}`}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-[var(--text)] bg-[var(--surface)]" />
              Wicket
            </span>
          </div>
          <div role="group" aria-label="Chart type" className="flex gap-1.5">
            <button type="button" onClick={() => setView("worm")} aria-pressed={view === "worm"} className={seg(view === "worm")}>
              Run worm
            </button>
            <button type="button" onClick={() => setView("bars")} aria-pressed={view === "bars"} className={seg(view === "bars")}>
              Runs per over
            </button>
          </div>
        </div>

        <svg viewBox={`0 0 ${model.width} ${model.height}`} className="block h-auto w-full" role="img" aria-label="Runs over the match for each innings">
          {grid.map((g) => (
            <g key={g.label}>
              <line x1={model.plot.x0} x2={model.plot.x1} y1={g.y} y2={g.y} stroke="var(--border)" strokeWidth="1" />
              <text x={model.plot.x0 - 6} y={g.y + 4} fontSize="11" fill="var(--text-faint)" textAnchor="end">
                {g.label}
              </text>
            </g>
          ))}
          {model.axis.map((a) => (
            <text key={a.label} x={a.x} y={model.height - 12} fontSize="11" fill="var(--text-faint)" textAnchor="middle">
              {a.label}
            </text>
          ))}
          {view === "worm" &&
            model.worm.map((w) => (
              <g key={w.period}>
                <polyline points={w.points} fill="none" stroke={colourOf(w.teamId)} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={w.period > 2 ? "6 5" : undefined} />
                <text x={w.end.x + 8} y={w.end.y + 4} fontSize="12" fontWeight="700" fill={colourOf(w.teamId)}>
                  {w.end.label}
                </text>
              </g>
            ))}
          {view === "worm" && model.wormWickets.map((w, i) => <circle key={i} cx={w.x} cy={w.y} r="5" fill="var(--surface)" stroke={colourOf(w.teamId)} strokeWidth="2.5" />)}
          {view === "bars" &&
            model.bars.map((b) => (
              <g key={`${b.period}-${b.over}`}>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="2" fill={colourOf(b.teamId)} opacity={b.over === over ? 1 : 0.7} strokeDasharray={b.period > 2 ? "3 2" : undefined} stroke={b.period > 2 ? "var(--surface)" : undefined} />
                {Array.from({ length: b.wickets }, (_, k) => (
                  <circle key={k} cx={b.x + b.w / 2} cy={b.y - 8 - k * 11} r="4" fill="var(--surface)" stroke={colourOf(b.teamId)} strokeWidth="2" />
                ))}
              </g>
            ))}
          {model.hitZones.map((z) => (
            <rect key={z.over} data-over={z.over} aria-label={`Over ${z.over}`} x={z.x} y={model.plot.y0} width={z.w} height={model.plot.y1 - model.plot.y0 + 10} fill="var(--sig)" opacity={z.over === over ? 0.1 : 0} className="cursor-pointer" onClick={() => setOver(z.over)} />
          ))}
        </svg>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3.5">
          <button type="button" onClick={() => setOver(Math.max(1, over - 1))} disabled={over <= 1} aria-label="Previous over" className="nav-pill text-[13px] disabled:opacity-40">
            ‹ Prev
          </button>
          <span className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-faint)]">
            Over {over} of {lastOver}
          </span>
          <button type="button" onClick={() => setOver(Math.min(lastOver, over + 1))} disabled={over >= lastOver} aria-label="Next over" className="nav-pill text-[13px] disabled:opacity-40">
            Next ›
          </button>
        </div>
        <div className="flex flex-wrap gap-4">
          {innings.map((inn) => (
            <OverPanel key={inn.period} over={inn.overs[over - 1]} innings={inn} colour={colourOf(inn.teamId)} number={over} />
          ))}
        </div>
      </div>
    </section>
  );
}
