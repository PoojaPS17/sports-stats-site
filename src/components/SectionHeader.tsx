export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="shrink-0 border-l-4 border-[var(--accent)] pl-2.5 text-lg font-extrabold tracking-tight text-[var(--text)]">
        {children}
      </h2>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
