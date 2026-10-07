import { Suspense } from "react";
import { pageMeta } from "@/lib/metadata";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PageHeader } from "@/components/PageHeader";
import { FollowingList } from "@/components/FollowingList";

// A client shell: the list is read from the visitor's own browser. Without `revalidate` a static page
// would freeze at the edge for a year (see privacy/page.tsx).
export const revalidate = 300;

// Personal to each visitor, so there is nothing for a search engine to list.
export const metadata = pageMeta("My follows", "The teams, players, series and matches you follow on SportsDB, with a link to share or restore them.", "/following", { noindex: true });

export default function FollowingPage() {
  return (
    <div className="flex flex-col gap-6">
      <Breadcrumbs items={[{ label: "My follows" }]} />
      <PageHeader title="My follows" subtitle="Saved in this browser. No account needed." />
      <Suspense fallback={<p className="text-sm text-[var(--text-muted)]">Loading your follows…</p>}>
        <FollowingList />
      </Suspense>
    </div>
  );
}
