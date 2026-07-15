/** Подпись филиала: название + город (если задан). */
export function branchLabel(c: {
  name: string;
  cityName?: string | null;
}): string {
  return c.cityName ? `${c.name} (${c.cityName})` : c.name;
}
