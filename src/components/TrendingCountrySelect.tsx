"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// See CountrySelect.tsx for why this reads/writes the URL itself rather than taking
// a server-computed href-builder function prop.
export function TrendingCountrySelect({ countries }: { countries: { code: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get("trending") ?? "global";

  function handleChange(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (next && next !== "global") sp.set("trending", next);
    else sp.delete("trending");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="nav-pill shrink-0 border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-muted)]"
    >
      {countries.map((c) => (
        <option key={c.code} value={c.code}>
          {c.label}
        </option>
      ))}
    </select>
  );
}
