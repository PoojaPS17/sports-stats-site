import Link from "next/link";
import { LocalTime } from "@/components/LocalTime";
import type { CSSProperties } from "react";
import type { FixtureLine, TeamNextBlockData, TeamSummary } from "@/lib/blockTypes";
import { ordinal } from "@/lib/ordinal";
import { CARD_TEXT_OPACITY, colourForWhiteText } from "@/lib/teamColor";

// The team's card: its own colour behind white text (darkened only as far as white needs to read), the
// table position and figure, the last five results, and what the visitor would see on the team page.
function SummaryCard({ name, color, s }: { name: string; color: string | null; s: TeamSummary }) {
  const style = { "--tc": colourForWhiteText(color, undefined, CARD_TEXT_OPACITY) } as CSSProperties;
  if (s.position === null && s.form.length === 0) return null;
  return (
    <div style={style} className="rounded-2xl bg-[linear-gradient(150deg,var(--tc),color-mix(in_srgb,var(--tc)_72%,#000))] p-4 text-white">
      <p className="text-[12px] font-semibold opacity-85">{name} · {s.leagueLabel}</p>
      {s.position !== null && (
        <p className="mt-1 flex items-baseline gap-2">
          <span className="display text-[38px] leading-none">{ordinal(s.position)}</span>
          {s.figure && <span className="text-[14px] font-bold opacity-90">{s.figure}</span>}
        </p>
      )}
      {s.record && <p className="mt-1 text-[12px] font-semibold opacity-85">{s.record}</p>}
      {s.form.length > 0 && (
        <div className="mt-3 flex gap-1" role="img" aria-label={`Last ${s.form.length}, oldest first: ${s.form.join(" ")}`}>
          {s.form.map((r, i) => (
            <span key={i} className={`flex h-[21px] w-[21px] items-center justify-center rounded-md text-[10.5px] font-extrabold text-white shadow-[0_0_0_1.5px_rgba(255,255,255,0.35)] ${r === "W" ? "bg-[#15803d]" : r === "L" ? "bg-[#dc2626]" : "bg-[#64748b]"}`}>
              {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Line({ f, team }: { f: FixtureLine; team: string }) {
  const sides = f.home ? `${team} v ${f.opponent}` : `${f.opponent} v ${team}`;
  return (
    <Link href={f.href} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-[var(--sig-ink)]">
      <span className="flex items-center gap-2 truncate">
        {f.result && <span className={`result-badge result-${f.result.toLowerCase()}`}>{f.result}</span>}
        {f.live && <span className="live-dot" />}
        <span className="truncate font-semibold">{sides}</span>
      </span>
      <span className="shrink-0 text-[var(--text-muted)]">
        {f.score ?? (f.live ? f.status : (f.tbd ?? <LocalTime iso={f.date} format="datetime" />))}
      </span>
    </Link>
  );
}

export function TeamNextBlock({ data }: { data: TeamNextBlockData }) {
  return (
    <div className="flex flex-col gap-3">
      {data.summary && <SummaryCard name={data.team.name} color={data.team.color} s={data.summary} />}
      <div className="divide-y divide-[var(--border)]">
      {data.last && (
        <div className="pb-1">
          <p className="eyebrow text-[var(--text-faint)]">Last</p>
          <Line f={data.last} team={data.team.name} />
        </div>
      )}
      <div className="pt-1">
        <p className="eyebrow text-[var(--text-faint)]">Next</p>
        {data.next.length === 0 ? <p className="py-2 text-sm text-[var(--text-muted)]">No fixtures listed yet.</p> : data.next.map((f) => <Line key={f.id} f={f} team={data.team.name} />)}
      </div>
      <Link href={data.team.href} className="block pt-2 text-sm font-semibold text-[var(--sig-ink)]">All fixtures →</Link>
      </div>
    </div>
  );
}
