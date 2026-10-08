import Link from "next/link";
import type { CSSProperties } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamLogo } from "@/components/TeamLogo";
import { LocalTime } from "@/components/LocalTime";
import { teamHex } from "@/lib/teamColor";
import { getRightNow } from "@/lib/rightNowData";
import { needLine, type RightNowSide, type RightNowView } from "@/lib/rightNow";

// Module 2 of the first visit: the one match worth a stranger's attention this second, picked by a stated
// rule (see rightNow.ts), with a truthful "Next up" or "Latest result" when nothing is in play. A server
// component: the same HTML for everyone, refreshed with the page.

const RING = 2 * Math.PI * 44;

const DESCRIPTION: Record<string, string> = {
  live: "Live this second. Scores refresh every 10 seconds",
  next: "Nothing in play yet. This is what starts next",
  latest: "Nothing in play. This is the latest result",
  none: "Nothing in play right now",
};

function Side({ side, showScore }: { side: RightNowSide; showScore: boolean }) {
  return (
    <div className={`rn-side${side.dim ? " is-dim" : ""}`}>
      <TeamLogo name={side.name} logoUrl={side.logo} color={side.color} size={30} />
      <div className="rn-nm">
        <b>{side.name}</b>
        {showScore && side.detail && <span>{side.detail}</span>}
      </div>
      {showScore && side.main && <span className="rn-sc">{side.main}</span>}
    </div>
  );
}

function ballClass(symbol: string): string {
  return symbol === "4" ? "b4" : symbol === "6" ? "b6" : symbol === "W" ? "bw" : "";
}

function Chase({ view }: { view: RightNowView }) {
  const { pick, worm, lastBalls, overNumber } = view;
  const c = pick.chase!;
  const chaser = pick.sides[pick.chasingIndex ?? 1];
  const setter = pick.sides[pick.chasingIndex === 0 ? 1 : 0];
  return (
    <>
      <div className="rn-chase">
        <div className="rn-ring" role="img" aria-label={`${chaser.name} need ${c.need} runs from ${c.ballsLeft} balls`}>
          <svg viewBox="0 0 104 104" aria-hidden>
            <circle className="bgc" cx="52" cy="52" r="44" />
            <circle className="fg" cx="52" cy="52" r="44" strokeDasharray={RING.toFixed(1)} strokeDashoffset={(RING * (1 - c.fraction)).toFixed(1)} />
          </svg>
          <div className="tx">
            <b>{c.need}</b>
            <span>off {c.ballsLeft}</span>
          </div>
        </div>
        <div className="rn-rates">
          <div>
            <span>Required rate</span>
            <b>{c.requiredRate.toFixed(2)}</b>
          </div>
          {c.currentRate !== null && (
            <div>
              <span>Current rate</span>
              <b>{c.currentRate.toFixed(2)}</b>
            </div>
          )}
          {c.wicketsLeft !== null && (
            <div>
              <span>Wickets left</span>
              <b>{c.wicketsLeft}</b>
            </div>
          )}
        </div>
      </div>
      {worm && (
        <>
          <div className="rn-wormbox">
            <svg className="rn-worm" viewBox={worm.viewBox} preserveAspectRatio="none" role="img" aria-label={`Runs by over: ${setter.name} against ${chaser.name}`}>
              {worm.lines.map((l) => (
                <polyline key={l.period} points={l.points} stroke={l.chasing ? "var(--sig)" : "var(--text-faint)"} strokeWidth={l.chasing ? 3.5 : 2.5} strokeDasharray={l.chasing ? undefined : "4 4"} />
              ))}
            </svg>
            {worm.dot && <span className="rn-wormdot" style={{ left: `${worm.dot.left}%`, top: `${worm.dot.top}%` }} aria-hidden />}
          </div>
          <div className="rn-legend">
            <span>
              <i style={{ background: "var(--sig)" }} />
              {chaser.name}, chasing
            </span>
            <span>
              <i style={{ background: "var(--text-faint)" }} />
              {setter.name}
            </span>
          </div>
        </>
      )}
      {lastBalls && lastBalls.length > 0 && (
        <div className="rn-balls" aria-label={`Latest over${overNumber ? `, over ${overNumber}` : ""}: ${lastBalls.join(" ")}`}>
          <span>Latest over</span>
          {lastBalls.map((b, i) => (
            <i key={i} className={ballClass(b)} aria-hidden>
              {b}
            </i>
          ))}
        </div>
      )}
    </>
  );
}

export async function RightNow() {
  return <RightNowCard view={await getRightNow()} />;
}

/** The card for a chosen view; split from the loader so a test can render any state. */
export function RightNowCard({ view }: { view: RightNowView }) {
  const { pick } = view;
  const live = pick.mode === "live";

  if (pick.mode === "none") {
    return (
      <section aria-label="Right now">
        <SectionHeader plain description={DESCRIPTION.none} action={{ label: "All scores", href: "#live" }}>
          Right now
        </SectionHeader>
        <div className="card px-4 py-4 text-sm text-[var(--text-muted)]">
          <p>Nothing is in play and no fixtures are stored for the coming days. The scores below fill in as soon as play starts.</p>
          <p className="mt-2 flex gap-4 font-semibold text-[var(--sig-ink)]">
            <Link href="/top-games" className="hover:underline">Top games</Link>
            <Link href="/cricket/series" className="hover:underline">Cricket series</Link>
          </p>
        </div>
      </section>
    );
  }

  const style = { "--rn-c1": pick.sides[0].color ? teamHex(pick.sides[0].color) : undefined, "--rn-c2": pick.sides[1].color ? teamHex(pick.sides[1].color) : undefined } as CSSProperties;
  const showScore = pick.mode !== "next";
  const pill = live ? (
    <span className="pill pill-live">
      <span className="live-dot" />
      {pick.stateLabel ? `Live · ${pick.stateLabel}` : "Live"}
    </span>
  ) : pick.mode === "next" ? (
    <span className="pill pill-upcoming">Next up</span>
  ) : (
    <span className="pill pill-final">Latest result</span>
  );
  const cricket = pick.rule === "chase" || pick.rule === "cricket";
  const linkLabel = live ? (cricket ? "Follow it ball by ball" : "Follow the live game") : pick.mode === "latest" ? "Match page and report" : "Match page and preview";

  return (
    <section aria-label="Right now">
      <SectionHeader plain description={DESCRIPTION[pick.mode]} action={{ label: "All scores", href: "#live" }}>
        Right now
      </SectionHeader>
      <article className="card rn" style={style}>
        <div className="rn-tp">
          {pill}
          <span className="rn-why">{live ? pick.why : pick.startIso && pick.mode === "next" ? <LocalTime iso={pick.startIso} format="datetime" league={pick.league ?? undefined} showZone /> : null}</span>
        </div>
        {pick.competition && <p className="rn-comp">{pick.competition}</p>}
        <div className="rn-sides">
          <Side side={pick.sides[0]} showScore={showScore} />
          <Side side={pick.sides[1]} showScore={showScore} />
        </div>
        {pick.chase ? (
          <Chase view={view} />
        ) : (
          pick.line && <p className="rn-line">{pick.line}</p>
        )}
        <Link href={pick.href} className="rn-go" aria-label={pick.chase ? `${linkLabel}: ${needLine(pick.chase)}` : undefined}>
          {linkLabel} →
        </Link>
      </article>
    </section>
  );
}
