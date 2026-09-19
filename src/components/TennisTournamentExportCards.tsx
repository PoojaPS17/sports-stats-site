import { ExportShell, ExportLabel } from "./ExportShell";
import { COMPETITION_LABEL, type CompetitionType, type TennisMatch, type TennisSide } from "@/lib/tennis";
import { CARD } from "@/lib/exportTheme";

type TournamentInfo = { name: string; season: number; tourLabel: string; major: boolean; location: string | null; range: string | null };

function TournamentHeader({ t, label }: { t: TournamentInfo; label: string }) {
  return (
    <div>
      <ExportLabel>Tennis · {t.tourLabel}{t.major ? " · Grand Slam" : ""}</ExportLabel>
      <div style={{ marginTop: 4, fontSize: 22, fontWeight: 800, lineHeight: 1.2, color: CARD.text }}>
        {t.name} {t.season}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, color: CARD.textMuted }}>{[label, t.location, t.range].filter(Boolean).join(" · ")}</div>
    </div>
  );
}

function SideRow({ side, won, decided, setCount }: { side: TennisSide; won: boolean; decided: boolean; setCount: number }) {
  const loser = decided && !won;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 0" }}>
      <span style={{ flex: 1, fontSize: 14, fontWeight: loser ? 500 : 700, color: loser ? CARD.textMuted : CARD.text }}>
        {side.seed != null && <span style={{ marginRight: 4, fontSize: 11, fontWeight: 500, color: CARD.textFaint }}>({side.seed})</span>}
        {side.names.join(" / ")}
        {decided && won && <span style={{ marginLeft: 6, color: CARD.win }}>✓</span>}
      </span>
      <span style={{ display: "flex", gap: 8, fontVariantNumeric: "tabular-nums" }}>
        {Array.from({ length: setCount }, (_, i) => {
          const set = side.sets[i];
          return (
            <span key={i} style={{ width: 20, textAlign: "right", fontSize: 14, fontWeight: set?.winner ? 800 : 400, color: set?.winner ? CARD.text : CARD.textMuted }}>
              {set ? set.games : ""}
              {set?.tiebreak != null && <sup style={{ fontSize: 9 }}>{set.tiebreak}</sup>}
            </span>
          );
        })}
      </span>
    </div>
  );
}

export function MatchBox({ m, caption }: { m: TennisMatch; caption?: string | null }) {
  const decided = m.winner_side != null;
  const setCount = Math.max(m.side1.sets?.length ?? 0, m.side2.sets?.length ?? 0);
  return (
    <div style={{ background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 10, padding: "8px 12px" }}>
      {caption && <div style={{ marginBottom: 2, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: m.status_state === "in" ? CARD.loss : CARD.textFaint }}>{caption}</div>}
      <SideRow side={m.side1} won={m.winner_side === 1} decided={decided} setCount={setCount} />
      <SideRow side={m.side2} won={m.winner_side === 2} decided={decided} setCount={setCount} />
      {!decided && m.completed && m.status_detail && m.status_detail !== "Final" && <div style={{ marginTop: 2, fontSize: 12, color: CARD.textMuted }}>{m.status_detail}</div>}
    </div>
  );
}

// The downloadable Draw: every match by draw and round, with seeds, set scores and the winner ticked.
export function TennisDrawExportCard({ tournament, draws }: { tournament: TournamentInfo; draws: { type: CompetitionType | null; matches: TennisMatch[] }[] }) {
  return (
    <ExportShell header={<TournamentHeader t={tournament} label="Draw" />} context={`${tournament.name} ${tournament.season} · Draw`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {draws.map((d) => {
          const rounds: { label: string | null; matches: TennisMatch[] }[] = [];
          for (const m of d.matches) {
            const last = rounds[rounds.length - 1];
            if (last && last.label === m.round) last.matches.push(m);
            else rounds.push({ label: m.round, matches: [m] });
          }
          return (
            <div key={d.type ?? "singles"}>
              <div style={{ borderBottom: `2px solid ${CARD.accent}`, paddingBottom: 4, fontSize: 13, fontWeight: 800, color: CARD.text }}>{d.type ? COMPETITION_LABEL[d.type] : "Singles"}</div>
              {rounds.map((r, i) => (
                <div key={`${r.label}-${i}`} style={{ marginTop: 12 }}>
                  {r.label && <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: CARD.textMuted }}>{r.label}</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {r.matches.map((m) => (
                      <MatchBox key={m.espn_id} m={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </ExportShell>
  );
}

// The downloadable Champions: who won each draw.
export function TennisChampionsExportCard({ tournament, champions }: { tournament: TournamentInfo; champions: { competition_type: CompetitionType; names: string[] }[] }) {
  return (
    <ExportShell header={<TournamentHeader t={tournament} label="Champions" />} context={`${tournament.name} ${tournament.season} · Champions`}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {champions.map((c) => (
          <div key={c.competition_type} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "10px 0", borderTop: `1px solid ${CARD.border}`, fontSize: 15 }}>
            <span style={{ color: CARD.textMuted }}>{COMPETITION_LABEL[c.competition_type]}</span>
            <span style={{ fontWeight: 800, color: CARD.text, textAlign: "right" }}>{c.names.join(" / ")}</span>
          </div>
        ))}
      </div>
    </ExportShell>
  );
}
