import Link from "next/link";

export type TeamPageTab = "overview" | "history" | "about";

export function TeamPageNav({ basePath, active }: { basePath: string; active: TeamPageTab }) {
  const tabs: { key: TeamPageTab; label: string; href: string }[] = [
    { key: "overview", label: "Overview", href: basePath },
    { key: "history", label: "History", href: `${basePath}/history` },
    { key: "about", label: "About", href: `${basePath}/about` },
  ];
  return (
    <div className="inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={active === t.key}
          className={`rounded-md px-3.5 py-1.5 text-sm font-semibold transition ${
            active === t.key ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
