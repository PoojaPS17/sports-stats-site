import Link from "next/link";
import { LastUpdated } from "./LastUpdated";

export interface TickerItem {
  href: string;
  label: string;
}

export function Ticker({ items, updatedAt }: { items: TickerItem[]; updatedAt: string | null }) {
  if (items.length === 0 && !updatedAt) return null;
  const doubled = [...items, ...items];

  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] bg-[var(--surface-muted)] py-2 pr-4 text-[var(--text)]">
      <div className="flex-1 overflow-hidden">
        {items.length > 0 && (
          <div className="flex w-max animate-marquee gap-8 whitespace-nowrap pl-4 text-xs font-semibold">
            {doubled.map((item, i) => (
              <Link key={i} href={item.href} className="flex items-center gap-2 opacity-80 hover:text-[var(--accent)] hover:opacity-100">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      {updatedAt && <LastUpdated iso={updatedAt} />}
    </div>
  );
}
