import Link from "next/link";

export interface TickerItem {
  href: string;
  label: string;
}

export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  const doubled = [...items, ...items];

  return (
    <div className="overflow-hidden border-b border-[var(--border)] bg-[var(--text)] py-2 text-[var(--bg)]">
      <div className="flex w-max animate-marquee gap-8 whitespace-nowrap text-xs font-medium">
        {doubled.map((item, i) => (
          <Link key={i} href={item.href} className="flex items-center gap-2 opacity-90 hover:opacity-100">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
