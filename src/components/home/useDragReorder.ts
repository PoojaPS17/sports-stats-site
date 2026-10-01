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

  useEffect(() => {
    order.current = ids;
  }, [ids]);

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const from = dragging.current;
      if (!from) return;
      const over = (document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drag-id]") as HTMLElement | null)?.dataset.dragId;
      if (!over || over === from) return;
      const next = order.current.filter((i) => i !== from);
      next.splice(order.current.indexOf(over), 0, from);
      const key = next.join("|");
      if (key === lastEmitted.current) return;
      lastEmitted.current = key;
      onReorder(next);
    },
    [onReorder]
  );

  const end = useCallback(
    function end() {
      if (!dragging.current) return;
      dragging.current = null;
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      onDrop();
    },
    [onDrop, onPointerMove]
  );

  // Removes any listeners a drag left attached (component unmounted mid-drag) and restores the
  // text-selection style so an interrupted drag never leaves the page selection-locked.
  useEffect(
    () => () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.style.userSelect = "";
    },
    [onPointerMove, end]
  );

  const handleProps = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = id;
      lastEmitted.current = order.current.join("|");
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    style: { touchAction: "none" as const, cursor: "grab" },
  });

  return { handleProps };
}
