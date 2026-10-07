/** A position worth showing: the source feeds fill unknown ones with "UKN", "N/A" and the like. */
export function realPosition(position: string | null | undefined): string | null {
  const p = position?.trim();
  return p && !/^(ukn|unk|unknown|n\/a|-+)$/i.test(p) ? p : null;
}
