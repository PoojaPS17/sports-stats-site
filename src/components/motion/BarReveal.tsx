"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { inViewport, prefersReducedMotion } from "./reduced";

/**
 * Makes the `bar-grow` bars (DOM bars sized by an inline width) grow in when they scroll into view. Without JavaScript, and for
 * a bar already on screen at first paint, the stylesheet's own animation runs at load. This component replays that for the
 * bars still below the fold: it parks them at zero (`data-bar-wait`) and releases each one the first time it is seen.
 * Reduced motion: nothing is parked, the stylesheet shows the final state. Renders nothing.
 */
export function BarReveal() {
  const pathname = usePathname();
  useEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver !== "function") return;
    const bars = Array.from(document.querySelectorAll<HTMLElement>(".bar-grow"));
    const waiting = bars.filter((b) => !inViewport(b));
    if (waiting.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.removeAttribute("data-bar-wait");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.2 }
    );
    for (const b of waiting) {
      b.setAttribute("data-bar-wait", "");
      io.observe(b);
    }
    return () => {
      io.disconnect();
      for (const b of waiting) b.removeAttribute("data-bar-wait");
    };
  }, [pathname]);
  return null;
}
