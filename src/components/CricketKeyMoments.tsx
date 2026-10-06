import { SectionHeader } from "@/components/SectionHeader";
import type { Moment } from "@/lib/cricketMatchMoments";

const PHASE = new Set<Moment["kind"]>(["powerplay", "drinks", "break"]);
/** 4.3 stays "4.3"; a whole over reads "6.0", the end of the sixth. */
const overLabel = (o: number) => (Number.isInteger(o) ? `${o}.0` : String(o));

/**
 * The timeline of the match, one list per innings under the batting side's name: wickets in the loss colour
 * (bold), landmarks in the side's colour, phases of play (powerplays, drinks, the break) muted.
 */
export function CricketKeyMoments({ moments, colours, teams }: { moments: Moment[]; colours: Record<string, string>; teams: Record<string, string> }) {
  if (moments.length === 0) return null;
  const periods = Array.from(new Set(moments.map((m) => m.innings))).sort((a, b) => a - b);
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader description="Wickets, landmarks and phases of play, innings by innings">Key moments</SectionHeader>
      <div className="card flex flex-col gap-5 px-4 py-4">
        {periods.map((p) => {
          const list = moments.filter((m) => m.innings === p);
          const teamId = list.find((m) => m.teamId)?.teamId ?? null;
          const team = teamId ? teams[teamId] ?? null : null;
          const colour = (teamId && colours[teamId]) || "var(--sig)";
          return (
            <div key={p}>
              <h3 className="eyebrow mb-2.5 text-[var(--text-muted)]">{team ? `${team} innings` : `Innings ${p}`}</h3>
              <ol className="flex flex-col gap-2 border-l border-[var(--border)] pl-5 text-sm">
                {list.map((m, i) => (
                  <li key={i} className="relative flex items-baseline gap-3">
                    <span
                      aria-hidden
                      className={`absolute -left-[25px] top-[5px] h-[9px] w-[9px] rounded-full ${m.kind === "wicket" ? "bg-[var(--loss)]" : PHASE.has(m.kind) ? "bg-[var(--border-strong)]" : ""}`}
                      style={m.kind === "wicket" || PHASE.has(m.kind) ? undefined : { backgroundColor: colour }}
                    />
                    <span className="w-9 shrink-0 text-xs tabular-nums text-[var(--text-faint)]">{m.over === null ? "" : overLabel(m.over)}</span>
                    <span className={m.kind === "wicket" ? "font-semibold" : PHASE.has(m.kind) ? "text-[var(--text-muted)]" : ""}>{m.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
