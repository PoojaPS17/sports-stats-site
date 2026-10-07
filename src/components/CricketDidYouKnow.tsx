import { SectionHeader } from "@/components/SectionHeader";

/** Short computed facts under the match or series figures; renders nothing without any. */
export function CricketDidYouKnow({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>Did you know?</SectionHeader>
      <ul className="card divide-y divide-[var(--border)] overflow-hidden text-sm">
        {lines.map((l) => (
          <li key={l} className="px-4 py-2.5">
            {l}
          </li>
        ))}
      </ul>
    </section>
  );
}
