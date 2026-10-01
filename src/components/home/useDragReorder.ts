"use client";

import { useCallback, useEffect, useRef } from "react";

/** Pointer-event reorder of a list of elements carrying `data-drag-id`. The handle starts the drag;
 * moving over another item moves the dragged one to that item's place; lifting the pointer commits. */
export function useDragReorder(ids: string[], onReorder: (ids: string[]) => void, onDrop: () => void) {
  const dragging = useRef<string | null>(null);
  const order = useRef(ids);
  // The order last sent to onReorder, so hovering the same gap repeatedly (or a pointer move
  // that lands on the same computed order) doesn't re-emit and re-render for nothing.
  const lastEmitted = useRef<string>(ids.join("|"));

  // onReorder/onDrop are fresh closures every render (both callers pass inline functions), and
  // calling onReorder mid-drag re-renders the parent. Reading them through refs lets onPointerMove
  // and end keep stable identities across that re-render, instead of being torn down and rebuilt
  // (which would drop the window listeners a drag still needs) mid-gesture.
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    order.current = ids;
  }, [ids]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const from = dragging.current;
    if (!from) return;
    const over = (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drag-id]") as HTMLElement | null)?.dataset.dragId;
    if (!over || over === from) return;
    const next = order.current.filter((i) => i !== from);
    next.splice(order.current.indexOf(over), 0, from);
    const key = next.join("|");
    if (key === lastEmitted.current) return;
    lastEmitted.current = key;
    onReorderRef.current(next);
  }, []);

  const end = useCallback(function end() {
    if (!dragging.current) return;
    dragging.current = null;
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    attached.current = null;
    onDropRef.current();
  }, [onPointerMove]);

  // The listeners actually attached by the onPointerDown below, so the unmount cleanup removes
  // exactly those (not a possibly-stale closure) if a drag is interrupted by unmounting.
  const attached = useRef<{ move: (e: PointerEvent) => void; up: () => void; cancel: () => void } | null>(null);

  // Unmount-only: this must not re-run mid-drag (onPointerMove/end are stable, but re-running on
  // every render was the actual bug - see the regression this fixes).
  useEffect(
    () => () => {
      if (attached.current) {
        window.removeEventListener("pointermove", attached.current.move);
        window.removeEventListener("pointerup", attached.current.up);
        window.removeEventListener("pointercancel", attached.current.cancel);
      }
      document.body.style.userSelect = "";
    },
    []
  );

  const handleProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = id;
      lastEmitted.current = order.current.join("|");
      document.body.style.userSelect = "none";
      attached.current = { move: onPointerMove, up: end, cancel: end };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    style: { touchAction: "none" as const, cursor: "grab" },
  });

  return { handleProps };
}
