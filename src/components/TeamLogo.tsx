function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(-2)
    .toUpperCase();
}

export function TeamLogo({
  name,
  logoUrl,
  color,
  size = 32,
}: {
  name: string;
  logoUrl: string | null;
  color?: string | null;
  size?: number;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 object-contain"
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size, background: color ?? "var(--surface-muted)" }}
      className="flex shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold text-white"
    >
      {initials(name)}
    </div>
  );
}
