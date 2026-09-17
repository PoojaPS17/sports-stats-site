"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Reads/writes the URL's "season" param itself rather than taking a server-computed
// href-builder function prop — a function isn't serializable across the Server/Client
// Component boundary (see CountrySelect.tsx for the bug this pattern avoids).
export function F1SeasonSelect({ seasons, defaultSeason }: { seasons: number[]; defaultSeason: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = Number(searchParams.get("season") ?? defaultSeason);

  function handleChange(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (Number(next) === defaultSeason) sp.delete("season");
    else sp.set("season", next);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="nav-pill shrink-0 border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-muted)]"
    >
      {seasons.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
