"use client";

import { useEffect, useRef } from "react";
import { inViewport, prefersReducedMotion } from "./reduced";

const DURATION_MS = 1200;
const PLAIN_NUMBER = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/;

function format(n: number, decimals: number, grouped: boolean): string {
  const fixed = n.toFixed(decimals);
  if (!grouped) return fixed;
  const [whole, frac] = fixed.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (frac ? `.${frac}` : "");
}

/**
 * A headline number that counts up once, the first time it scrolls into view (a number already on screen at load stays as it is). `value` is the exact text to show: the server
 * HTML, a visitor without JavaScript, a visitor who asks for reduced motion and the end of the count all show it unchanged.
 * Only plain numbers ("1,247", "27.4") animate; anything else ("12-5", "55%", "-") renders as given. The box keeps its final
 * width while counting, so nothing around it moves.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const m = PLAIN_NUMBER.exec(value);
    const node = el?.firstChild;
    // The text node React rendered is the one rewritten (never replaced), so a later render still finds it.
    if (!el || !(node instanceof Text) || !m || prefersReducedMotion() || typeof IntersectionObserver !== "function") return;
    const decimals = m[2]?.length ?? 0;
    const grouped = m[1].includes(",");
    const target = Number(value.replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    let raf = 0;
    let done = false;
    // While counting, the box holds its final width and the digits are tabular, so nothing around it shifts.
    const hold = () => {
      el.style.display = "inline-block";
      el.style.minWidth = `${el.offsetWidth}px`;
      el.style.fontVariantNumeric = "tabular-nums";
    };
    const release = () => {
      el.style.display = "";
      el.style.minWidth = "";
      el.style.fontVariantNumeric = "";
    };
    const run = () => {
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / DURATION_MS);
        const eased = 1 - Math.pow(1 - p, 3);
        node.data = p < 1 ? format(target * eased, decimals, grouped) : value;
        if (p < 1) raf = requestAnimationFrame(step);
        else {
          done = true;
          release();
        }
      };
      hold();
      node.data = format(0, decimals, grouped);
      raf = requestAnimationFrame(step);
    };
    // In view at mount: the number was already on screen in its final form, so counting from zero now would be a visible reset. Leave it.
    if (inViewport(el)) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      // Leaving mid-count (a new value, a route change) always leaves the exact text behind.
      if (!done) {
        node.data = value;
        release();
      }
    };
  }, [value]);
  return (
    <span ref={ref} className={className} data-count-up="">
      {value}
    </span>
  );
}
