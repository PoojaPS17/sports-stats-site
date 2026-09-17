import Link from "next/link";
import type { FormResult, MatchContext, SideContext } from "@/lib/matchContext";
import type { GameRow, League } from "@/lib/queries";
import { isSoccerLeague } from "@/lib/queries";

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function Form({ form }: { form: FormResult[] }) {
  if (form.length === 0) return <span className="text-[var(--text-faint)]">—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {[...form].reverse().map((r, i) => (
        <span
          key={i}
          className={`inline-block h-5 w-5 rounded text-center text-[11px] font-bold leading-5 text-white ${r === "W" ? "bg-[var(--win)]" : r === "L" ? "bg-[var(--loss)]" : "bg-[var(--draw)]"}`}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function Elo({ side }: { side: SideContext }) {
  if (side.elo == null) return <span className="text-[var(--text-faint)]">—</span>;
  const delta = side.eloAfter != null ? side.eloAfter - side.elo : null;
  return (
    <span className="tabular-nums">
      {side.elo}
      {delta != null && delta !== 0 && (
        <span className={`ml-1 text-xs font-semibold ${delta > 0 ? "text-[var(--win)]" : "text-[var(--loss)]"}`}>
          {delta > 0 ? "+" : ""}
          {delta}
        </span>
      )}
    </span>
  );
}

function Standing({ side, soccer }: { side: SideContext; soccer: boolean }) {
  if (soccer) {
    const p = side.position;
    if (!p || (p.before == null && p.after == null)) return <span className="text-[var(--text-faint)]">—</span>;
    const before = p.before != null ? ordinal(p.before) : "—";
    if (p.after == null || p.after === p.before) return <span>{p.after != null ? ordinal(p.after) : before}</span>;
    return (
      <span>
        <span className="text-[var(--text-muted)]">{before}</span> → <span className="font-semibold">{ordinal(p.after)}</span>
      </span>
    );
  }
  const r = side.record;
  if (!r) return <span className="text-[var(--text-faint)]">—</span>;
  if (r.after == null) return <span>{r.before}</span>;
  return (
    <span>
      <span className="text-[var(--text-muted)]">{r.before}</span> → <span className="font-semibold">{r.after}</span>
    </span>
  );
}

// Going in and coming out: ratings, the probability they implied, recent form, and
// where the result left each side. Everything computed from stored results.
export function MatchContextCard({ league, game, context }: { league: League; game: GameRow; context: MatchContext }) {
  const soccer = isSoccerLeague(league);
  const p = context.probabilities;
  const rows: { label: string; away: React.ReactNode; home: React.ReactNode }[] = [
    { label: game.completed ? "Elo rating (change)" : "Elo rating", away: <Elo side={context.away} />, home: <Elo side={context.home} /> },
    { label: "Form going in", away: <Form form={context.away.form} />, home: <Form form={context.home.form} /> },
  ];
  const standingLabel = soccer ? (game.completed ? "Table position" : "Position") : game.completed ? "Record" : "Record going in";
  if ((soccer && (context.home.position || context.away.position)) || (!soccer && (context.home.record || context.away.record))) {
    rows.push({ label: standingLabel, away: <Standing side={context.away} soccer={soccer} />, home: <Standing side={context.home} soccer={soccer} /> });
  }

  return (
    <div className="card flex flex-col gap-3 px-4 py-4">
      {p && (
        <div>
          <div className="mb-1 flex justify-between text-xs font-semibold text-[var(--text-muted)]">
            <span>
              {game.away_abbr ?? game.away_name} {Math.round(p.awayWin * 100)}%
            </span>
            {soccer && <span>Draw {Math.round(p.draw * 100)}%</span>}
            <span>
              {Math.round(p.homeWin * 100)}% {game.home_abbr ?? game.home_name}
            </span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
            <span className="bg-[var(--loss)]" style={{ width: `${p.awayWin * 100}%` }} />
            {soccer && <span className="bg-[var(--draw)]" style={{ width: `${p.draw * 100}%` }} />}
            <span className="bg-[var(--win)]" style={{ width: `${p.homeWin * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-[var(--text-faint)]">
            Pre-match win probability from Elo ratings at kickoff{game.completed ? "" : " (updates as results come in)"}. Not a betting line.
          </p>
        </div>
      )}
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[var(--border)]">
              <td className="py-2 text-left">{r.away}</td>
              <td className="py-2 text-center text-xs text-[var(--text-muted)]">{r.label}</td>
              <td className="py-2 text-right">{r.home}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {context.week && (
        <p className="text-xs text-[var(--text-muted)]">
          Part of{" "}
          <Link href={context.week.href} className="font-semibold text-[var(--accent)] hover:underline">
            {context.week.label}
          </Link>
          {context.tableSize ? ` · ${context.tableSize}-team table` : ""}
        </p>
      )}
    </div>
  );
}
