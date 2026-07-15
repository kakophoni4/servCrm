/**
 * ID заявки: MMYYWNNNN (9 цифр).
 * См. docs/06-ID-RULES.md
 */
export function weekOfMonth(date: Date): number {
  const day = date.getDate();
  return Math.min(5, Math.ceil(day / 7));
}

export function buildOrderPrefix(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  const w = String(weekOfMonth(date));
  return `${mm}${yy}${w}`;
}

export function buildPublicId(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(4, '0')}`;
}
