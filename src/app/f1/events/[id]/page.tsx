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
import { f1EventDescription, f1EventStatus } from "@/lib/f1Status";
import { f1SessionLabel, sortF1Sessions } from "@/lib/f1Sessions";
import { f1FormatDate, f1RaceInstant } from "@/lib/f1Dates";
import { f1LabelKey } from "@/lib/f1RaceOrder";
import type { Metadata } from "next";

export const revalidate = 300;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand and 404 (dynamicParams is left at its default).
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await getF1Event(id);
  if (!event) return pageMeta("F1 Grand Prix", "Formula 1 race weekend results.", undefined, { noindex: true });
  const year = event.season_year ?? new Date(event.date).getUTCFullYear();
  const where = event.circuit_name ? ` at ${event.circuit_name}` : "";
  const description = f1EventDescription(event, year, where);
  return pageMeta(`${event.name} ${year}: Results`, description, `/f1/events/${event.espn_id}`);
}

export default async function F1EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getF1Event(id);
  if (!event) notFound();

  const results = await getF1EventResults(id);
  const status = f1EventStatus(event);
  const bySession = new Map<string, typeof results>();
  for (const r of results) {
    if (!bySession.has(r.session_espn_id)) bySession.set(r.session_espn_id, []);
    bySession.get(r.session_espn_id)!.push(r);
  }
  // In the order the weekend was run, the race last (f1Sessions.ts).
  const sessions = sortF1Sessions(event.season_year, [...bySession.values()].map((rows) => ({ session_type: rows[0].session_type, rows })));
  const sessionLabel = (type: string) => f1SessionLabel(event.season_year, type);
  const labelKey = (rows: typeof results) => f1LabelKey(rows.map((r) => r.result_label));

  return (
    <div className="flex flex-col gap-6">
      <JsonLd data={breadcrumbSchema([{ label: "Formula 1", href: "/f1" }, { label: event.name }])} />
      <div>
        <Link href="/f1" className="text-sm text-[var(--text-muted)] hover:underline">
          ← F1 Calendar
        </Link>
        <h1 className="page-title mt-1">{event.name}</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          {f1FormatDate(f1RaceInstant(event), event.circuit_name, { weekday: "long", month: "long", day: "numeric", year: "numeric" }, event.espn_id)}
          {event.circuit_name && ` · ${event.circuit_name}`}
          {event.circuit_city && event.circuit_country && ` · ${event.circuit_city}, ${event.circuit_country}`}
        </p>
      </div>

      <AdSlot label="F1 event top" />

      {sessions.length === 0 ? (
        <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">
          {status.kind === "called-off" ? `This race weekend was ${status.label?.toLowerCase()}.` : "No session results on record for this weekend yet."}
        </p>
      ) : (
        sessions.map(({ rows: sessionResults }) => {
          const first = sessionResults[0];
          return (
            <section key={first.session_espn_id}>
              <SectionHeader
                tools={
                  first.completed && (
                    <ImageActions
                      filename={`f1-${event.espn_id}-${first.session_type.toLowerCase()}`}
                      shareTitle={`${event.name}: ${sessionLabel(first.session_type)}`}
                      width={640}
                      card={<F1SessionExportCard event={{ name: event.name, id: event.espn_id, date: f1RaceInstant(event).toISOString(), circuit: event.circuit_name }} sessionLabel={sessionLabel(first.session_type)} results={sessionResults} />}
                    />
                  )
                }
              >
                {sessionLabel(first.session_type)}
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
                      {/* in the order getF1EventResults returns: a race's retirements and disqualifications are placed there */}
                      {sessionResults
                        .map((r) => (
                          <tr key={r.driver_espn_id} className="table-row">
                            <td className="py-2 pl-4 tabular-nums text-[var(--text-muted)]">{r.result_label ?? r.position ?? "—"}</td>
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
                  {labelKey(sessionResults) && <p className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]">{labelKey(sessionResults)}</p>}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
