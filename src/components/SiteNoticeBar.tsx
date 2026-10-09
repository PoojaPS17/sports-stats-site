import Link from "next/link";
import { prefetchFor } from "@/lib/prefetch";
import { SITE_NOTICE, activeNotice } from "@/lib/siteNotice";

export function SiteNoticeBar() {
  const notice = activeNotice(SITE_NOTICE);
  if (!notice) return null;
  const since = new Date(`${notice.since}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div role="status" className="border-b border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)]">
      <div className="container-x flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
        <span className="font-semibold">{since}:</span>
        <span>{notice.text}</span>
        {notice.href && (
          <Link prefetch={prefetchFor(notice.href)} href={notice.href} className="text-[var(--accent)] underline">
            More
          </Link>
        )}
      </div>
    </div>
  );
}
