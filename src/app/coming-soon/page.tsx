import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

// The holding page the site's own domain shows before launch (see src/proxy.ts).
export const metadata: Metadata = {
  title: `${SITE_NAME}: coming soon`,
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent)]">Live scores and the record books</p>
      <h1 className="max-w-xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{SITE_NAME} is on its way</h1>
      <p className="max-w-md text-[var(--text-muted)]">
        Live scores, standings and more than a decade of results across football, the NFL, NBA, cricket, tennis and Formula 1.
        Opening soon.
      </p>
    </div>
  );
}
