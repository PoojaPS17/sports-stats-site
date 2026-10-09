"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "./reduced";

/**
 * Wraps a live score. When the value changes after the first render, a green wash fades over it once (the `score-flash`
 * class, an opacity animation on a pseudo-element). It never touches the text: the number on screen is always the one passed in.
 * The first render, a value that was empty before, and a visitor who asks for reduced motion never flash.
 */
export function ScoreFlash({ value, className, children }: { value: string | number | null; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);
  useEffect(() => {
    const before = last.current;
    last.current = value;
    const el = ref.current;
    if (!el || before === value || before === null || value === null || prefersReducedMotion()) return;
    el.classList.remove("score-flash");
    void el.offsetWidth;
    el.classList.add("score-flash");
  }, [value]);
  return (
    <span ref={ref} className={className} onAnimationEnd={(e) => e.currentTarget.classList.remove("score-flash")}>
      {children}
    </span>
  );
}
