import Link from "next/link";
import type { League } from "@/lib/leagues";
import type { CricketInningsRow } from "@/lib/matchDetail";
import { economyWidth, strikeRateWidth, type ScorecardTabData } from "@/lib/cricketScorecardView";

/** The tint behind a strike rate or an economy: the side's colour, the loss colour for an expensive over rate, the soft accent without a colour. */
function Bar({ width, colour, loss = false }: { width: number; colour: string | null; loss?: boolean }) {
  if (width <= 0) return null;
  if (loss) return <span aria-hidden className="absolute inset-y-1 right-0 rounded-sm bg-[var(--loss)] opacity-20" style={{ width: `${width}%` }} />;
  if (colour) return <span aria-hidden className="absolute inset-y-1 right-0 rounded-sm opacity-20" style={{ width: `${width}%`, backgroundColor: colour }} />;
  return <span aria-hidden className="absolute inset-y-1 right-0 rounded-sm bg-[var(--sig-soft)]" style={{ width: `${width}%` }} />;
}

function Table({
  title,
  labels,
  rows,
  league,
  playerSlugs,
  bar,
  foot,
}: {
  title: string;
  labels: string[];
  rows: CricketInningsRow[];
  league: League;
  playerSlugs: Map<string, string>;
  /** The column that gets a bar behind its value, and the bar for a row's value. */
  bar: { column: number; of: (value: string) => { width: number; colour: string | null; loss?: boolean } };
  foot?: React.ReactNode;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="card overflow-hidden">
      <p className="px-4 pt-3 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="table-head text-left">
              <th className="py-2 pl-4 font-medium">Player</th>
              {labels.map((label) => (
                <th key={label} className="px-2 py-2 text-right font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const slug = playerSlugs.get(row.athleteId);
              return (
                <tr key={`${row.athleteId}-${row.innings ?? 0}-${idx}`} className="border-t border-[var(--border)]">
                  <td className="py-2 pl-4 font-medium">
                    {slug ? (
                      <Link href={`/${league}/players/${slug}`} className="hover:underline">
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                    {row.dismissal && <span className="block text-xs font-normal text-[var(--text-muted)]">{row.dismissal}</span>}
                  </td>
                  {row.stats.map((value, i) => (
                    <td key={i} className="relative px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
                      {i === bar.column && <Bar {...bar.of(value)} />}
                      <span className="relative">{value}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {foot}
        </table>
      </div>
    </div>
  );
}

/**
 * One innings of the scorecard: the batting card (strike-rate bars, extras and total) beside the bowling
 * card (economy bars, the fall of wickets), stacked below `lg`.
 */
export function CricketScorecardPanel({ tab, league, playerSlugs }: { tab: ScorecardTabData; league: League; playerSlugs: Map<string, string> }) {
  const { block, colour, extras, totalLine, fallOfWickets } = tab;
  const span = block.batting.labels.length;
  const foot =
    extras.total !== null || totalLine ? (
      <tfoot className="border-t border-[var(--border)]">
        {extras.total !== null && (
          <tr>
            <th scope="row" className="py-2 pl-4 text-left font-semibold">
              Extras
            </th>
            <td colSpan={span} className="px-2 py-2 text-right tabular-nums text-[var(--text-muted)]">
              {extras.total}
              {extras.breakdown ? ` (${extras.breakdown})` : ""}
            </td>
          </tr>
        )}
        {totalLine && (
          <tr className="border-t border-[var(--border)]">
            <th scope="row" className="py-2 pl-4 text-left font-bold">
              Total
            </th>
            <td colSpan={span} className="px-2 py-2 text-right font-bold tabular-nums">
              {totalLine}
            </td>
          </tr>
        )}
      </tfoot>
    ) : undefined;
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[3fr_2fr] lg:items-start">
      <Table title={block.batting.title} labels={block.batting.labels} rows={block.batting.rows} league={league} playerSlugs={playerSlugs} bar={{ column: 4, of: (v) => ({ width: strikeRateWidth(v), colour }) }} foot={foot} />
      <div className="flex flex-col gap-3">
        <Table title={block.bowling.title} labels={block.bowling.labels} rows={block.bowling.rows} league={league} playerSlugs={playerSlugs} bar={{ column: 4, of: (v) => ({ width: economyWidth(v), colour, loss: Number(v) > 10 }) }} />
        {fallOfWickets && (
          <p className="card px-4 py-2.5 text-xs leading-relaxed text-[var(--text-muted)]">
            <span className="font-semibold text-[var(--text)]">Fall of wickets</span> {fallOfWickets}
          </p>
        )}
      </div>
    </div>
  );
}
