"use client";

import { useEffect, useState } from "react";
import { dayTimeZone } from "@/lib/gameDay";
import { isSoccerLeague, type League } from "@/lib/leagues";
import { formatLocalTime, type LocalTimeFormat } from "@/lib/localTime";

// Kickoff / tip-off date and time in the visitor's own time zone. The server can't
// know the visitor's zone, so the server render shows a fallback and the value is
// replaced after hydration. `suppressHydrationWarning` covers the expected text
// difference; the element is the same either way.
//
// `serverTimeZone` is the zone of that first-paint fallback only. A caller rendering an NFL or NBA
// game passes dayTimeZone(league), so the HTML the server sends (and what a crawler or a visitor
// with JavaScript off reads) shows the Eastern date the league files the game under, instead of a
// UTC date that can be the next day. After hydration it is the visitor's own zone either way.
//
// `league` gives both of those at once, and one more thing: a football time is a 24-hour clock with its zone
// named ("14:30 UTC" on the server, "15:30 BST" once the visitor's own zone is known), as BBC and ESPN.com
// print it. The server paint says "UTC" explicitly, so nothing reads as the visitor's zone before hydration.
export function LocalTime({
  iso,
  format: fmt = "time",
  className = "",
  serverTimeZone,
  league,
}: {
  iso: string;
  format?: LocalTimeFormat;
  className?: string;
  serverTimeZone?: string;
  league?: League;
}) {
  const [label, setLabel] = useState<string | null>(null);
  const clock24 = league !== undefined && isSoccerLeague(league);
  const firstPaintZone = serverTimeZone ?? (league !== undefined ? dayTimeZone(league) : undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabel(formatLocalTime(iso, fmt, { clock24 }));
  }, [iso, fmt, clock24]);

  return (
    <time dateTime={iso} className={`tabular-nums ${className}`} suppressHydrationWarning>
      {label ?? formatLocalTime(iso, fmt, { clock24, timeZone: firstPaintZone })}
    </time>
  );
}
