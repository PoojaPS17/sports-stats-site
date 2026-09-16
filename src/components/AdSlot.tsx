export function AdSlot({ label = "Ad" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] py-6 text-xs text-[var(--text-muted)]">
      {label} slot — wire up AdSense/Ezoic here
    </div>
  );
}
