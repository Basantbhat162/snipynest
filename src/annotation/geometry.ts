export interface Point {
  x: number;
  y: number;
}
export interface Rectangle extends Point {
  width: number;
  height: number;
}
const clamp = (value: number, maximum: number) =>
  Math.min(maximum, Math.max(0, value));

export function boundedRectangle(
  start: Point,
  end: Point,
  width: number,
  height: number,
): Rectangle {
  const x = Math.floor(clamp(Math.min(start.x, end.x), width));
  const y = Math.floor(clamp(Math.min(start.y, end.y), height));
  const right = Math.ceil(clamp(Math.max(start.x, end.x), width));
  const bottom = Math.ceil(clamp(Math.max(start.y, end.y), height));
  return { x, y, width: right - x, height: bottom - y };
}

export function imagePoint(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
): Point {
  return {
    x: clamp(
      ((clientX - bounds.left) * width) / Math.max(1, bounds.width),
      width,
    ),
    y: clamp(
      ((clientY - bounds.top) * height) / Math.max(1, bounds.height),
      height,
    ),
  };
}

// Baking oldest operations preserves their visible result while dropping undo data.
export function trimUndoHistory<T>(
  history: T[],
  sizeOf: (action: T) => number,
  bake: (action: T) => void,
  byteBudget: number,
  countBudget: number,
): T[] {
  let bytes = history.reduce((sum, action) => sum + sizeOf(action), 0);
  let start = 0;
  while (
    start < history.length &&
    (bytes > byteBudget || history.length - start > countBudget)
  ) {
    const action = history[start++];
    bake(action);
    bytes -= sizeOf(action);
  }
  return history.slice(start);
}

export function nextStepNumber(
  history: { tool: string; number?: number }[],
  baseline: number,
): number {
  return history.reduce(
    (number, action) =>
      action.tool === "step" && action.number !== undefined
        ? action.number + 1
        : number,
    baseline,
  );
}
