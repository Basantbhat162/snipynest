import type { Rectangle } from "./geometry";

export type CropEdge = "move" | "n" | "e" | "s" | "w" | "nw" | "ne" | "sw" | "se";
export const cropEdges: Exclude<CropEdge, "move">[] = ["n", "e", "s", "w", "nw", "ne", "sw", "se"];
const clamp = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)));

/** The crop guide initially includes the whole image; a ratio fits inside it. */
export function initialCrop(width: number, height: number, aspect = 0): Rectangle {
  const w = aspect > 0 ? Math.max(1, Math.floor(Math.min(width, height * aspect))) : width;
  const h = aspect > 0 ? Math.max(1, Math.min(height, Math.round(w / aspect))) : height;
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h };
}

export function cropChangesImage(crop: Rectangle | null, width: number, height: number): boolean {
  return !!crop && (crop.x !== 0 || crop.y !== 0 || crop.width !== width || crop.height !== height);
}

export function adjustCrop(r: Rectangle, dx: number, dy: number, edge: CropEdge, width: number, height: number, aspect = 0): Rectangle {
  if (edge === "move") return { ...r, x: clamp(r.x + dx, 0, width - r.width), y: clamp(r.y + dy, 0, height - r.height) };
  const west = edge.includes("w"), east = edge.includes("e");
  const north = edge.includes("n"), south = edge.includes("s");
  let left = r.x, top = r.y, right = r.x + r.width, bottom = r.y + r.height;
  if (west) left = clamp(left + dx, 0, right - 1);
  if (east) right = clamp(right + dx, left + 1, width);
  if (north) top = clamp(top + dy, 0, bottom - 1);
  if (south) bottom = clamp(bottom + dy, top + 1, height);
  if (!(aspect > 0)) return { x: left, y: top, width: right - left, height: bottom - top };

  // A side keeps its opposite edge and the perpendicular centre fixed. A corner
  // keeps its opposite corner fixed and follows the dominant pointer movement.
  const horizontal = west || east, vertical = north || south;
  const anchorX = west ? r.x + r.width : r.x;
  const anchorY = north ? r.y + r.height : r.y;
  const centerX = r.x + r.width / 2, centerY = r.y + r.height / 2;
  const maxWidth = horizontal ? (west ? anchorX : width - anchorX) : 2 * Math.min(centerX, width - centerX);
  const maxHeight = vertical ? (north ? anchorY : height - anchorY) : 2 * Math.min(centerY, height - centerY);
  const useWidth = horizontal && (!vertical || Math.abs(dx) >= Math.abs(dy) * aspect);
  const requestedWidth = useWidth ? right - left : (bottom - top) * aspect;
  const w = Math.max(1, Math.floor(Math.min(requestedWidth, maxWidth, maxHeight * aspect)));
  const h = Math.max(1, Math.min(Math.floor(maxHeight), Math.round(w / aspect)));
  return {
    x: clamp(horizontal ? (west ? anchorX - w : anchorX) : centerX - w / 2, 0, width - w),
    y: clamp(vertical ? (north ? anchorY - h : anchorY) : centerY - h / 2, 0, height - h),
    width: w,
    height: h,
  };
}
