"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "./reduced";

const DURATION_MS = 380;
const EASING = "cubic-bezier(0.2, 0.7, 0.2, 1)";

/**
 * FLIP for a list of keyed children: call `snapshot()` just before the state change that moves, adds or removes items, and
 * after React commits every child that moved glides from its old place to its new one (a transform animation, so the
 * layout itself jumps straight to the end state). Children are the direct `[data-drag-id]` elements of the container.
 * Positions are page positions, so a scroll between the snapshot and the commit adds no false movement.
 */
export function useFlip(container: RefObject<HTMLElement | null>) {
  const first = useRef<Map<string, { x: number; y: number }> | null>(null);

  const snapshot = () => {
    const el = container.current;
    if (!el || prefersReducedMotion()) {
      first.current = null;
      return;
    }
    const map = new Map<string, { x: number; y: number }>();
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const id = child.dataset.dragId;
      if (!id) continue;
      const r = child.getBoundingClientRect();
      map.set(id, { x: r.left + window.scrollX, y: r.top + window.scrollY });
    }
    first.current = map;
  };

  // No dependency list on purpose: it runs after every commit and does nothing unless a snapshot is waiting.
  useLayoutEffect(() => {
    const before = first.current;
    const el = container.current;
    if (!before || !el) return;
    first.current = null;
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const id = child.dataset.dragId;
      const from = id ? before.get(id) : undefined;
      if (!id || !from) continue;
      const r = child.getBoundingClientRect();
      const dx = from.x - (r.left + window.scrollX);
      const dy = from.y - (r.top + window.scrollY);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      child.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: DURATION_MS, easing: EASING });
    }
  });

  return snapshot;
}
