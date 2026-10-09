"use client";

import { useLayoutEffect, type RefObject } from "react";

// The active item of a tab or chip row, whichever attribute the control marks it with.
const ACTIVE = '[aria-current="page"], [aria-current="true"], [aria-selected="true"], [aria-pressed="true"], [data-active="true"]';

/**
 * Slides one underline (`<span className="slide-ind" aria-hidden />`, the last child of the row) under the active item
 * of a tab or chip row. The row must carry `slide-host`. The hook only measures: it writes the active item's left edge and
 * width as `--ind-x` / `--ind-w` and the row's `data-ind` flag, and the stylesheet does the moving with transform alone.
 * Until it has measured (and with JavaScript off) the control keeps the underline or fill it always had.
 * `data-ind="1"` shows the underline in place with no transition (first paint); `"go"` turns the glide on a frame later.
 */
export function useSlideIndicator(ref: RefObject<HTMLElement | null>, key: string | number | boolean | null) {
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    let raf = 0;
    const measure = () => {
      const active = host.querySelector<HTMLElement>(ACTIVE);
      if (!active || active.offsetWidth === 0) {
        host.removeAttribute("data-ind");
        return;
      }
      host.style.setProperty("--ind-x", String(active.offsetLeft));
      host.style.setProperty("--ind-w", String(active.offsetWidth));
      if (!host.hasAttribute("data-ind")) {
        host.setAttribute("data-ind", "1");
        raf = requestAnimationFrame(() => {
          raf = requestAnimationFrame(() => host.setAttribute("data-ind", "go"));
        });
      }
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(host);
    for (const child of Array.from(host.children)) ro?.observe(child);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [ref, key]);
}
