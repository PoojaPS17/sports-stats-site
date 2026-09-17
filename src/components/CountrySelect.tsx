"use client";

import { useRouter } from "next/navigation";

export function CountrySelect({
  countries,
  value,
  buildHref,
}: {
  countries: { country: string; views: number }[];
  value: string;
  buildHref: (country: string) => string;
}) {
  const router = useRouter();

  return (
    <select
      value={value}
      onChange={(e) => router.push(buildHref(e.target.value))}
      className="nav-pill shrink-0 border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-muted)]"
    >
      <option value="">All Countries</option>
      {countries.map((c) => (
        <option key={c.country} value={c.country}>
          {c.country}
        </option>
      ))}
    </select>
  );
}
