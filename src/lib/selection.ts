/** Only the selection that started a successful drop may be consumed. */
export function selectionAfterDrop(current: Set<string>, started: Set<string>, ids: readonly string[], dropped: boolean): Set<string> {
  if (!dropped || current !== started) return current;
  const remaining = new Set(current);
  for (const id of ids) remaining.delete(id);
  return remaining;
}
