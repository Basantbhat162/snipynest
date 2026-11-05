/** Only the selection that started a successful drop may be consumed. */
export function selectionAfterDrop(current: Set<string>, started: Set<string>, ids: readonly string[], dropped: boolean): Set<string> {
  if (!dropped || current !== started) return current;
  const remaining = new Set(current);
  for (const id of ids) remaining.delete(id);
  return remaining;
}

/** Apply the target checkbox state to an inclusive range in the displayed order. */
export function selectRange(current: Set<string>, order: readonly string[], anchor: string | null, target: string, checked: boolean): Set<string> {
  const end = order.indexOf(target);
  if (end < 0) return current;
  const start = anchor === null ? end : order.indexOf(anchor);
  const next = new Set(current);
  for (const id of order.slice(Math.min(start < 0 ? end : start, end), Math.max(start, end) + 1)) {
    if (checked) next.add(id); else next.delete(id);
  }
  return next;
}
