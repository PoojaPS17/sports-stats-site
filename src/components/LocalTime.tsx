"use client";

import { useEffect, useState } from "react";

type Format = "time" | "date" | "datetime";

function format(iso: string, fmt: Format): string {
  const d = new Date(iso);
  if (fmt === "time") return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (fmt === "date") return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

// Kickoff / tip-off date and time in the visitor's own time zone. The server can't
// know the visitor's zone, so the server render shows a UTC-based fallback and the
// value is replaced after hydration. `suppressHydrationWarning` covers the expected
// text difference; the element is the same either way.
export function LocalTime({ iso, format: fmt = "time", className = "" }: { iso: string; format?: Format; className?: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(format(iso, fmt));
  }, [iso, fmt]);

  return (
    <time dateTime={iso} className={`tabular-nums ${className}`} suppressHydrationWarning>
      {label ?? format(iso, fmt)}
    </time>
  );
}
