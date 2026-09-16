"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SearchBar({ large = false, initialQuery = "" }: { large?: boolean; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a team or player, like Lakers"
        className={`w-full rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] ${
          large ? "py-3 text-base" : "py-2 text-sm"
        }`}
      />
      <button
        type="submit"
        className={`shrink-0 rounded-full bg-[var(--accent)] font-semibold text-[var(--accent-foreground)] transition hover:opacity-90 ${
          large ? "px-6 py-3" : "px-4 py-2 text-sm"
        }`}
      >
        Search
      </button>
    </form>
  );
}
