"use client";

import { clearSetup } from "@/lib/homeSetup";

export const BACK_TO_FULL_CONFIRM = "Go back to the full site view? The blocks saved on this device will be cleared.";

// The way out of a built homepage: clears the setup saved in this browser, which removes data-home from <html>
// and brings the full home (picker and all) back. Asks first, because the blocks are not kept anywhere else.
export function BackToFullSite({ className = "" }: { className?: string }) {
  const go = () => {
    if (!window.confirm(BACK_TO_FULL_CONFIRM)) return;
    clearSetup();
    window.scrollTo({ top: 0 });
  };
  return (
    <button type="button" onClick={go} className={`back-full ${className}`}>
      Back to full site view
    </button>
  );
}
