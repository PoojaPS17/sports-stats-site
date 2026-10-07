"use client";

import { useEffect } from "react";
import { classifyPath, internalPath } from "@/lib/funnel";

// One click listener for the whole site: a click on a link that stays on SportsDB sends
// funnel_click with the kind of page it came from and the kind it goes to (homepage to match,
// match to player, ...). Delegated, so no link needs touching. Goes through gtag, so it follows the
// same consent choice as every other GA4 hit: where analytics is denied, GA4 gets cookieless pings only.
// It listens in the capture phase: next/link calls preventDefault() on every internal click before the
// event bubbles up to document, so a bubble-phase listener that skips defaultPrevented clicks sees none.
export function FunnelEvents() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !window.gtag) return;
      const to = internalPath(a.getAttribute("href") ?? "", location.origin, location.pathname);
      if (to === null || to === location.pathname) return;
      const toKind = classifyPath(to);
      const fromKind = classifyPath(location.pathname);
      // "Where on the page": the nearest landmark, so a nav link and a card are told apart.
      const area = a.closest("nav") ? "nav" : a.closest("footer") ? "footer" : a.closest("main") ? "content" : "other";
      window.gtag("event", "funnel_click", { from_page: fromKind, to_page: toKind, link_area: area });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
