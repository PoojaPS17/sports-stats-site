import { playerNotFound } from "@/lib/legacySlug";
import Link from "next/link";
import { getF1DriverBySlug, getF1DriverResults } from "@/lib/f1";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { ImageActions } from "@/components/ImageActions";
import { F1ResultsExportCard, driverResultRows } from "@/components/F1ExportCards";
import { TeamLogo } from "@/components/TeamLogo";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/structuredData";
import { pageMeta } from "@/lib/metadata";
import { f1FormatDate } from "@/lib/f1Dates";
import type { Metadata } from "next";

export const revalidate = 300;

// An empty list, so nothing is built up front: each address is rendered on the first request and
// then served from the cache above until it goes stale. Without this export the page would be
// rendered again on every request and the revalidate above would never apply. Addresses that do
// not exist still render on demand and 404 (dynamicParams is left at its default).
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const driver = await getF1DriverBySlug(slug);
  if (!driver) return pageMeta("F1 Driver", "Formula 1 driver results.", undefined, { noindex: true });
  const results = await getF1DriverResults(driver.espn_id);
  const team = results.find((r) => r.constructor_name)?.constructor_name;
  return pageMeta(
    `${driver.name} F1 Race Results`,
    `${driver.name}'s Formula 1 results, race by race: finishing position, team and date for ${team ? `the ${team} driver's` : "their"} most recent Grands Prix.`,
    `/f1/drivers/${driver.slug}`,
    { noindex: results.length === 0 }
  );
}

export default async function F1DriverPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const driver = (await getF1DriverBySlug(slug)) ?? (await playerNotFound("f1", slug, (s) => `/f1/drivers/${s}`));

  const results = await getF1DriverResults(driver.espn_id);
  const currentTeam = results.find((r) => r.constructor_name)?.constructor_name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <JsonLd data={breadcrumbSchema([{ label: "Formula 1", href: "/f1" }, { label: "Standings", href: "/f1/standings" }, { label: driver.name }])} />
      <div className="flex items-center gap-3">
        <TeamLogo name={driver.name} logoUrl={driver.headshot_url} size={56} priority />
        <div>
          <h1 className="page-title">{driver.name}</h1>
          <p className="text-sm text-[var(--text-muted)]">F1{currentTeam && ` · ${currentTeam}`}</p>
        </div>
      </div>

      <AdSlot label="F1 driver top" />

      <section>
        <SectionHeader
          tools={results.length > 0 && <ImageActions filename={`f1-${slug}-results`} shareTitle={`${driver.name} recent race results`} width={640} card={<F1ResultsExportCard title={`${driver.name}: recent race results`} subtitle={currentTeam} rows={driverResultRows(results)} />} />}
        >
          Recent Race Results
        </SectionHeader>
        {results.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No race results on record yet.</p>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {results.map((r) => (
              <Link
                key={r.event_espn_id}
                href={`/f1/events/${r.event_espn_id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[var(--surface-muted)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.event_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {f1FormatDate(r.session_date, r.circuit_name, { month: "short", day: "numeric", year: "numeric" })}
                    {r.constructor_name && ` · ${r.constructor_name}`}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums">
                  {r.winner ? "🏆 " : ""}
                  {r.position ? `P${r.position}` : "—"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
