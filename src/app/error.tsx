"use client";

import { useEffect } from "react";
import { SiteLinks } from "@/components/SiteLinks";

// The fallback for an error thrown while rendering a page. It sits inside the root layout, so the
// header and footer stay. No data is read here: the failure may be the data itself. Next injects
// no noindex for an error boundary and the root layout says index, so this page tags itself
// (React hoists a rendered meta tag into the head).
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
      <meta name="robots" content="noindex" />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Something went wrong</p>
        <h1 className="page-title mt-2">This page could not load</h1>
        <p className="mx-auto mt-3 max-w-md text-[var(--text-muted)]">It is on our side and usually clears in a moment. Try again, or carry on from the links below.</p>
      </div>
      <button type="button" onClick={() => retry()} className="nav-pill nav-pill-active">
        Try again
      </button>
      <SiteLinks />
    </div>
  );
}
