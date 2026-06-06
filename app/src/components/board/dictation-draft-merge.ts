export function mergeDraftWithDictation(base: string, live: string): string {
  const trimmedLive = live.trim();
  if (!base) return trimmedLive;
  if (!trimmedLive) return base;
  return `${base} ${trimmedLive}`;
}
