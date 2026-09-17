export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <rect x="7" y="17" width="4" height="8" rx="1.5" fill="var(--accent-foreground)" />
      <rect x="14" y="11" width="4" height="14" rx="1.5" fill="var(--accent-foreground)" />
      <rect x="21" y="7" width="4" height="18" rx="1.5" fill="var(--accent-foreground)" />
    </svg>
  );
}
