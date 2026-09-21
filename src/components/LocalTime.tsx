"use client";

import { useEffect, useState } from "react";

type Format = "time" | "date" | "datetime";

// `timeZone: undefined` is what toLocale*String already does, so the visitor's own zone is used
// whenever no zone is passed — which is every call after hydration.
function format(iso: string, fmt: Format, timeZone?: string, showZone = false): string {
  const d = new Date(iso);
  const zone: Intl.DateTimeFormatOptions = showZone ? { timeZoneName: "short" } : {};
  if (fmt === "time") return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone, ...zone });
  if (fmt === "date") return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone })} · ${d.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    ...zone,
  })}`;
}

// Kickoff / tip-off date and time in the visitor's own time zone. The server can't
// know the visitor's zone, so the server render shows a fallback and the value is
// replaced after hydration. `suppressHydrationWarning` covers the expected text
// difference; the element is the same either way.
//
// `showZone` prints the zone's short name after the clock time ("4:00 AM EDT"). Tennis uses it: a match's time is
// otherwise a bare clock reading with nothing to say which zone it is in, and the server's fallback (Eastern) and
// the visitor's own differ.
//
// `serverTimeZone` is the zone of that first-paint fallback only. A caller rendering an NFL or NBA
// game passes dayTimeZone(league), so the HTML the server sends (and what a crawler or a visitor
// with JavaScript off reads) shows the Eastern date the league files the game under, instead of a
// UTC date that can be the next day. After hydration it is the visitor's own zone either way.
export function LocalTime({
  iso,
  format: fmt = "time",
  className = "",
  serverTimeZone,
  showZone = false,
}: {
  iso: string;
  format?: Format;
  className?: string;
  serverTimeZone?: string;
  showZone?: boolean;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(format(iso, fmt, undefined, showZone));
  }, [iso, fmt, showZone]);

  return (
    <time dateTime={iso} className={`tabular-nums ${className}`} suppressHydrationWarning>
      {label ?? format(iso, fmt, serverTimeZone, showZone)}
    </time>
  );
}
