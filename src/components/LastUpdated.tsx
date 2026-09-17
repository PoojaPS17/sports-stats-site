"use client";

import { useEffect, useState } from "react";

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function LastUpdated({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => formatRelative(iso));

  useEffect(() => {
    const id = setInterval(() => setLabel(formatRelative(iso)), 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <span
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap border-l border-[var(--border)] pl-3 text-[11px] text-[var(--text-muted)]"
      title={`Data last refreshed ${iso}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--win)]" />
      <span className="hidden sm:inline">Updated </span>
      {label}
    </span>
  );
}
