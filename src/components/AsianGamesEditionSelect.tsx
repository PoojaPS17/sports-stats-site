"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function AsianGamesEditionSelect({ editions, defaultEdition }: { editions: number[]; defaultEdition: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = Number(searchParams.get("edition") ?? defaultEdition);

  function handleChange(next: string) {
    const sp = new URLSearchParams(searchParams.toString());
    if (Number(next) === defaultEdition) sp.delete("edition");
    else sp.set("edition", next);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="nav-pill shrink-0 border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text-muted)]"
    >
      {editions.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}
