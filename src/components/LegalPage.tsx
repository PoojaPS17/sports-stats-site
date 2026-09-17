import { Breadcrumbs } from "./Breadcrumbs";
import { PageHeader } from "./PageHeader";

// Long-form policy pages: a narrow measure and consistent heading rhythm.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: title }]} />
      <PageHeader title={title} subtitle={`Last updated ${updated}`} />
      <article className="card max-w-3xl px-6 py-6 text-[15px] leading-relaxed text-[var(--text)] [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2:first-child]:mt-0 [&_h3]:mb-1 [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1 [&_a]:text-[var(--accent)] [&_a]:underline">
        {children}
      </article>
    </div>
  );
}
