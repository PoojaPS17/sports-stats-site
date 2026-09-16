import Link from "next/link";

export function TeamPageNav({ basePath, active }: { basePath: string; active: "overview" | "about" }) {
  return (
    <div className="flex gap-1.5">
      <Link href={basePath} className={`nav-pill text-sm ${active === "overview" ? "nav-pill-active" : "text-[var(--text-muted)]"}`}>
        Overview
      </Link>
      <Link href={`${basePath}/about`} className={`nav-pill text-sm ${active === "about" ? "nav-pill-active" : "text-[var(--text-muted)]"}`}>
        About
      </Link>
    </div>
  );
}
