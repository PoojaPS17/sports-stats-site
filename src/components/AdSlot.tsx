export function AdSlot({ label = "Ad" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded border border-dashed border-neutral-300 bg-neutral-50 py-6 text-xs text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900">
      {label} slot — wire up AdSense/Ezoic here
    </div>
  );
}
