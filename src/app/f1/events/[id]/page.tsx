import { notFound } from "next/navigation";
import Link from "next/link";
import { getF1Event, getF1EventResults } from "@/lib/f1";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { ImageActions } from "@/components/ImageActions";
import { F1SessionExportCard } from "@/components/F1ExportCards";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/structuredData";
import { pageMeta } from "@/lib/metadata";
import type { Metadata } from "next";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await getF1Event(id);
  if (!event) return pageMeta("F1 Grand Prix", "Formula 1 race weekend results.", undefined, { noindex: true });
  const year = event.season_year ?? new Date(event.date).getUTCFullYear();
  const where = event.circuit_name ? ` at ${event.circuit_name}` : "";
  const description = event.winner_name
    ? `${event.winner_name} won the ${year} ${event.name}${where}. Classifications for the race, qualifying and practice.`
    : `The ${year} ${event.name}${where}: practice, qualifying and race classifications, added as each session finishes.`;
  return pageMeta(`${event.name} ${year}: Results`, description, `/f1/events/${event.espn_id}`);
}

const SESSION_LABEL: Record<string, string> = {
  FP1: "Free Practice 1",
  FP2: "Free Practice 2",
  FP3: "Free Practice 3",
  Qual: "Qualifying",
  Sprint: "Sprint",
  Race: "Race",
};

export default async function F1EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getF1Event(id);
  if (!event) notFound();

  const results = await getF1EventResults(id);
  const bySession = new Map<string, typeof results>();
  for (const r of results) {
    if (!bySession.has(r.session_espn_id)) bySession.set(r.session_espn_id, []);
    bySession.get(r.session_espn_id)!.push(r);
  }
  // Race last, practice sessions first — the order a fan actually cares about.
  const sessionOrder = ["FP1", "FP2", "FP3", "Sprint", "Qual", "Race"];
  const sessions = [...bySession.values()].sort((a, b) => {
    const ai = sessionOrder.indexOf(a[0]?.session_type ?? "");
    const bi = sessionOrder.indexOf(b[0]?.session_type ?? "");
    return ai - bi;
  });

  return (
    <div className="flex flex-col gap-6">
      <JsonLd data={breadcrumbSchema([{ label: "Formula 1", href: "/f1" }, { label: event.name }])} />
      <div>
        <Link href="/f1" className="text-sm text-[var(--text-muted)] hover:underline">
          ← F1 Calendar
        </Link>
        <h1 className="page-title mt-1">{event.name}</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {new Date(event.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          {event.circuit_name && ` · ${event.circuit_name}`}
          {event.circuit_city && event.circuit_country && ` · ${event.circuit_city}, ${event.circuit_country}`}
        </p>
      </div>

      <AdSlot label="F1 event top" />

      {sessions.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No session results on record for this weekend yet.</p>
      ) : (
        sessions.map((sessionResults) => {
          const first = sessionResults[0];
          return (
            <section key={first.session_espn_id}>
              <SectionHeader
                tools={
                  first.completed && (
                    <ImageActions
                      filename={`f1-${event.espn_id}-${first.session_type.toLowerCase()}`}
                      shareTitle={`${event.name}: ${SESSION_LABEL[first.session_type] ?? first.session_type}`}
                      width={640}
                      card={<F1SessionExportCard event={{ name: event.name, date: event.date, circuit: event.circuit_name }} sessionLabel={SESSION_LABEL[first.session_type] ?? first.session_type} results={sessionResults} />}
                    />
                  )
                }
              >
                {SESSION_LABEL[first.session_type] ?? first.session_type}
              </SectionHeader>
              {!first.completed ? (
                <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
                  {first.status_detail ?? "Not yet run."}
                </p>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="table-head text-left">
                        <th className="py-2 pl-4 font-medium">Pos</th>
                        <th className="py-2 font-medium">Driver</th>
                        <th className="py-2 pr-4 font-medium">Team</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionResults
                        .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
                        .map((r) => (
                          <tr key={r.driver_espn_id} className="table-row">
                            <td className="py-2 pl-4 tabular-nums text-[var(--text-muted)]">{r.position ?? "—"}</td>
                            <td className="py-2">
                              <Link href={`/f1/drivers/${r.driver_slug}`} className="font-medium hover:underline">
                                {r.winner ? "🏆 " : ""}
                                {r.driver_name}
                              </Link>
                            </td>
                            <td className="py-2 pr-4 text-[var(--text-muted)]">{r.constructor_name ?? "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
