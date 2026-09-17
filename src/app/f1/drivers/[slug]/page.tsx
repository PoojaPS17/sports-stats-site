import { notFound } from "next/navigation";
import Link from "next/link";
import { getF1DriverBySlug, getF1DriverResults } from "@/lib/f1";
import { AdSlot } from "@/components/AdSlot";
import { SectionHeader } from "@/components/SectionHeader";
import { TeamLogo } from "@/components/TeamLogo";

export const revalidate = 300;

export default async function F1DriverPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const driver = await getF1DriverBySlug(slug);
  if (!driver) notFound();

  const results = await getF1DriverResults(driver.espn_id);
  const currentTeam = results.find((r) => r.constructor_name)?.constructor_name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <TeamLogo name={driver.name} logoUrl={driver.headshot_url} size={56} />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{driver.name}</h1>
          <p className="text-sm text-[var(--text-muted)]">F1{currentTeam && ` · ${currentTeam}`}</p>
        </div>
      </div>

      <AdSlot label="F1 driver top" />

      <section>
        <SectionHeader>Recent Race Results</SectionHeader>
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
                    {new Date(r.session_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
