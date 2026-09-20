import { notFound } from "next/navigation";
import Link from "next/link";
import { getF1ConstructorBySlug, getF1ConstructorDrivers, getF1ConstructorResults } from "@/lib/f1";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { ImageActions } from "@/components/ImageActions";
import { F1ResultsExportCard, constructorResultRows } from "@/components/F1ExportCards";
import { TeamLogo } from "@/components/TeamLogo";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/structuredData";
import { pageMeta } from "@/lib/metadata";
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
  const team = await getF1ConstructorBySlug(slug);
  if (!team) return pageMeta("F1 Team", "Formula 1 constructor results.", undefined, { noindex: true });
  const drivers = await getF1ConstructorDrivers(team.name);
  const names = drivers.map((d) => d.name);
  const lineup = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  return pageMeta(
    `${team.name} F1 Team: Drivers and Race Results`,
    lineup && names.length <= 4
      ? `${team.name} in Formula 1: ${lineup} in the cars, and where each finished in the team's most recent Grands Prix.`
      : `${team.name} in Formula 1: the current drivers and where each finished in the team's most recent Grands Prix.`,
    `/f1/teams/${team.slug}`
  );
}

export default async function F1ConstructorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = await getF1ConstructorBySlug(slug);
  if (!team) notFound();

  const [drivers, results] = await Promise.all([getF1ConstructorDrivers(team.name), getF1ConstructorResults(team.name)]);

  return (
    <div className="flex flex-col gap-6">
      <JsonLd data={breadcrumbSchema([{ label: "Formula 1", href: "/f1" }, { label: "Standings", href: "/f1/standings" }, { label: team.name }])} />
      <div className="flex items-center gap-3">
        <TeamLogo name={team.name} logoUrl={team.logo_url} color={team.color} size={56} />
        <div>
          <h1 className="page-title">{team.name}</h1>
          <p className="text-sm text-[var(--text-muted)]">F1 Constructor</p>
        </div>
      </div>

      <AdSlot label="F1 constructor top" />

      <section>
        <SectionHeader>Drivers</SectionHeader>
        {drivers.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No current drivers on record.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {drivers.map((d) => (
              <Link
                key={d.espn_id}
                href={`/f1/drivers/${d.slug}`}
                className="card flex items-center gap-2.5 px-3 py-2.5 font-medium hover:bg-[var(--surface-muted)]"
              >
                <TeamLogo name={d.name} logoUrl={d.headshot_url} size={28} />
                {d.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          tools={results.length > 0 && <ImageActions filename={`f1-${slug}-results`} shareTitle={`${team.name} recent race results`} width={640} card={<F1ResultsExportCard title={`${team.name}: recent race results`} subtitle="Constructor" rows={constructorResultRows(results)} />} />}
        >
          Recent Race Results
        </SectionHeader>
        {results.length === 0 ? (
          <p className="card px-4 py-6 text-sm text-[var(--text-muted)]">No race results on record yet.</p>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {results.map((r) => (
              <Link
                key={`${r.event_espn_id}-${r.driver_slug}`}
                href={`/f1/events/${r.event_espn_id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-[var(--surface-muted)]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.event_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {r.driver_name} ·{" "}
                    {new Date(r.session_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
