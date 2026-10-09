import { TeamLogo } from "@/components/TeamLogo";
import { ScoreFlash } from "@/components/motion/ScoreFlash";
import { LocalTime } from "@/components/LocalTime";
import { splitCricketScore } from "@/lib/cricketMatchExtras";

export interface HeroSide {
  name: string;
  /** ESPN's score text, "172/2 (14.4/20 ov, target 172)"; empty for a fixture. */
  score: string;
  winner: boolean;
  logo: string | null;
  /** ESPN's team colour, drawn as the row's edge bar; null draws the band's hairline instead. */
  colour: string | null;
}

export interface CricketMatchHeroProps {
  state: "pre" | "in" | "post";
  /** Why a match ESPN closed without playing was closed ("Abandoned", "Cancelled"), else null. */
  calledOff: string | null;
  /** The page's h1 text: name · stage · series. */
  headline: string;
  date: string | null;
  sides: [HeroSide, HeroSide];
  /** ESPN's result line in full names, results only. */
  result: string | null;
  potm: { name: string; line: string | null } | null;
  /** Facts from the summary notes: toss, series state, match number. */
  pills: string[];
  /** Run rate and required rate while in play (or ESPN's status line), else null. */
  liveLine: string | null;
  /** The ground, shown when there is no result or live line (a fixture). */
  venue: string | null;
  /** The headline is the page's h1 unless the page has its own (the league game page keeps a screen-reader h1). */
  headingTag?: "h1" | "p";
  /** The result's Share menu, at the right end of the first row. */
  share?: React.ReactNode;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/**
 * The match at a glance on the deep band: the status pill and the page's h1 line, each side with
 * its colour bar, crest and display-size score, then the result and the Player of the Match, then
 * the facts ESPN notes. Inside `.band-deep` the band tokens resolve to the deep palette, so the
 * component names only `--sig`, `--mast-muted` and `--mast-line`.
 */
export function CricketMatchHero({ state, calledOff, headline, date, sides, result, potm, pills, liveLine, venue, headingTag = "h1", share }: CricketMatchHeroProps) {
  const Heading = headingTag;
  const pill =
    state === "in" ? (
      <span className="pill pill-live">
        <span className="live-dot" />
        Live
      </span>
    ) : calledOff ? (
      <span className="pill pill-final">{calledOff}</span>
    ) : state === "post" ? (
      <span className="pill pill-final">Result</span>
    ) : (
      <span className="pill pill-upcoming">Upcoming</span>
    );
  const line = result ?? liveLine ?? venue;
  return (
    <section className="band-deep relative flex flex-col gap-5 overflow-hidden rounded-2xl border border-[var(--mast-line)] px-5 py-5 sm:px-6" aria-label="Match summary">
      <div className={`flex flex-wrap items-center justify-between gap-2 text-xs ${share ? "max-sm:pr-12" : ""}`}>
        <span className="flex flex-wrap items-center gap-2">
          {pill}
          <Heading className="font-semibold text-[var(--mast-muted)]">{headline}</Heading>
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {date && <LocalTime iso={date} format={calledOff ? "date" : "datetime"} className="text-[var(--mast-muted)]" />}
          {share && <div className="z-10 max-sm:absolute max-sm:right-5 max-sm:top-[13px]">{share}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {sides.map((side, i) => {
          const muted = state === "post" && !side.winner;
          const { main, detail } = splitCricketScore(side.score);
          return (
            <div key={i} className={`flex min-w-0 items-center gap-4 border-l-[6px] pl-4 max-[359px]:gap-2.5 max-[359px]:pl-3 ${main.length > 12 ? "max-[359px]:flex-wrap" : ""} ${muted ? "text-[var(--mast-muted)]" : ""}`} style={{ borderColor: side.colour ?? "var(--mast-line)" }}>
              <TeamLogo name={side.name} logoUrl={side.logo} size={52} priority />
              <div className="flex min-w-min flex-col">
                <span className={`line-clamp-2 text-[20px] max-[419px]:text-[18px] max-[359px]:text-[17px] leading-tight sm:text-[22px] ${muted ? "font-bold" : "font-extrabold"}`}>{side.name}</span>
                {detail && <span className="text-[13px] text-[var(--mast-muted)]">{detail}</span>}
              </div>
              {main && <ScoreFlash value={main} className={`display ml-auto tabular-nums ${main.length > 12 ? "min-w-0 max-w-[58%] text-right max-[359px]:ml-0 max-[359px]:max-w-full max-[359px]:basis-full max-[359px]:text-left text-[22px] leading-tight sm:text-[30px]" : main.length > 6 ? "shrink-0 text-[30px] leading-none sm:text-[40px]" : "shrink-0 text-[44px] leading-none max-[419px]:text-[34px] max-[359px]:text-[30px] sm:text-[56px]"}`}>{main}</ScoreFlash>}
            </div>
          );
        })}
      </div>

      {(line || potm) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--mast-line)] pt-4">
          {result && <p className="text-[20px] font-bold leading-snug text-[var(--sig)]">{result}</p>}
          {!result && liveLine && <p className="text-[15px] font-semibold">{liveLine}</p>}
          {!result && !liveLine && venue && <p className="text-[14px] text-[var(--mast-muted)]">{venue}</p>}
          {potm && (
            <span className="flex flex-wrap items-center gap-3">
              <span className="eyebrow eyebrow-quiet text-[var(--mast-muted)]">Player of the Match</span>
              <span className="flex items-center gap-2.5 rounded-full bg-[var(--mast-line)] py-1.5 pl-1.5 pr-3.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sig)] text-[12px] font-extrabold text-[var(--band-deep)]">{initials(potm.name)}</span>
                <span className="text-[14px] font-bold">{potm.name}</span>
                {potm.line && <span className="text-[14px] text-[var(--mast-muted)] tabular-nums">{potm.line}</span>}
              </span>
            </span>
          )}
        </div>
      )}

      {pills.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-[12px] text-[var(--mast-muted)]">
          {pills.map((p) => (
            <li key={p} className="rounded-full border border-[var(--mast-line)] px-2.5 py-1">
              {p}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
