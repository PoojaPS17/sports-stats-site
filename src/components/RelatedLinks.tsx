import Link from "next/link";
import { SectionHeader } from "./SectionHeader";
import { TeamLogo } from "./TeamLogo";
import type { RelatedLink } from "@/lib/related";

export interface RelatedGroup {
  title: string;
  links: RelatedLink[];
}

// The link mesh at the foot of player, team, match and head-to-head pages: a few
// short lists that lead to the next page a reader (or a crawler) would want.
export function RelatedLinks({ groups, title = "Related pages", description }: { groups: RelatedGroup[]; title?: string; description?: string }) {
  const shown = groups.filter((g) => g.links.length > 0);
  if (shown.length === 0) return null;
  return (
    <section>
      <SectionHeader description={description}>{title}</SectionHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((g) => (
          <div key={g.title} className="card px-4 py-3">
            <h3 className="mb-2 text-[0.65rem] font-bold uppercase tracking-wide text-[var(--text-muted)]">{g.title}</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {g.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} prefetch={false} className="flex items-center gap-2 hover:text-[var(--accent)]">
                    {(l.image || l.imageName) && <TeamLogo name={l.imageName ?? l.label} logoUrl={l.image ?? null} size={18} />}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{l.label}</span>
                      {l.sub && <span className="block truncate text-xs text-[var(--text-muted)]">{l.sub}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
