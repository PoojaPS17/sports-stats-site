import { teamDisplayName } from "@/lib/teamName";
import { TeamLogo } from "./TeamLogo";
import { ExportFooter } from "./ExportFooter";
import { ExportMore, capRows } from "./ExportShell";
import { LEAGUE_LABEL, type League, type RosterPlayer } from "@/lib/queries";
import { CARD } from "@/lib/exportTheme";

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(-2).toUpperCase();
}

function RosterRow({ player }: { player: RosterPlayer }) {
  const facts = [player.jersey ? `#${player.jersey}` : null, player.height, player.weight, player.age != null ? `${player.age}y` : null].filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: CARD.bg, border: `1px solid ${CARD.border}`, borderRadius: 10, padding: 8 }}>
      {player.headshot_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={player.headshot_url} width={32} height={32} crossOrigin="anonymous" alt="" style={{ width: 32, height: 32, borderRadius: 999, objectFit: "cover", background: CARD.accentSoft, flexShrink: 0 }} />
      ) : (
        <div style={{ display: "flex", width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 999, background: CARD.accentSoft, fontSize: 11, fontWeight: 700, color: CARD.accent, flexShrink: 0 }}>
          {initials(player.name)}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: CARD.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {player.name}
          {player.is_captain ? " (C)" : ""}
          {player.is_wicketkeeper ? " (WK)" : ""}
        </div>
        <div style={{ fontSize: 11, color: CARD.textMuted }}>
          {player.position && !/^unknown$/i.test(player.position) ? player.position : "—"}
          {facts.length > 0 ? ` · ${facts.join(" · ")}` : ""}
        </div>
      </div>
    </div>
  );
}

// The downloadable version of "Current roster" as a compact grid. A 53-man NFL roster
// stops at 25 players and says how many more there are.
export function TeamRosterExportCard({
  league,
  teamName,
  teamLogo,
  teamColor,
  roster,
}: {
  league: League;
  teamName: string;
  teamLogo: string | null;
  teamColor: string | null;
  roster: RosterPlayer[];
}) {
  const { shown, hidden } = capRows(roster);
  return (
    <div style={{ background: CARD.surface, border: `1px solid ${CARD.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", height: 52, width: 52, alignItems: "center", justifyContent: "center", borderRadius: 10, background: CARD.bg, flexShrink: 0 }}>
          <TeamLogo name={teamName} logoUrl={teamLogo} color={teamColor} size={36} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: CARD.textMuted }}>{LEAGUE_LABEL[league]}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: CARD.text, lineHeight: 1.15 }}>{teamDisplayName(teamName)} current roster</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 16 }}>
        {shown.map((p) => (
          <RosterRow key={p.espn_id} player={p} />
        ))}
      </div>
      <ExportMore boxed count={hidden} noun={hidden === 1 ? "more player" : "more players"} />
      <ExportFooter context={`${teamDisplayName(teamName)} roster`} />
    </div>
  );
}
