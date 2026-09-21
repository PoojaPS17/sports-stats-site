import type { Metadata } from "next";
import { SiteLinks } from "@/components/SiteLinks";

// Rendered inside the root layout, so the header and footer are the site's own. Next answers
// with a 404 status and injects its own noindex tag for any request that lands here. Metadata
// from segments is merged shallowly, so without a robots value of its own this page would also
// inherit the root layout's index, follow and googleBot directives and ship two contradictory
// robots tags. Setting robots here replaces the whole inherited object, googleBot included.
export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 text-center">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Error 404</p>
        <h1 className="page-title mt-2">We could not find that page</h1>
        <p className="mx-auto mt-3 max-w-md text-[var(--text-muted)]">
          The address may be mistyped, or the team, player or match may not be on record. Try search, or pick up from a sport below.
        </p>
      </div>
      <SiteLinks />
    </div>
  );
}
