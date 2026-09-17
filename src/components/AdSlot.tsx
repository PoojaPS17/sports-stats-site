// Ad placement. Renders nothing until an ad network is actually configured
// (NEXT_PUBLIC_ADS_ENABLED=true) so visitors never see an empty "wire this up"
// placeholder on a production page. Call sites stay in place so the slots are
// easy to light up later.
export function AdSlot({ label = "Ad" }: { label?: string }) {
  if (process.env.NEXT_PUBLIC_ADS_ENABLED !== "true") return null;
  return (
    <div
      data-ad-slot={label}
      className="flex min-h-[90px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] text-xs text-[var(--text-faint)]"
    >
      Advertisement
    </div>
  );
}
