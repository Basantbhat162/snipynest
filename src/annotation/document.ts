import {
  boundedRectangle,
  nextStepNumber,
  trimUndoHistory,
} from "./geometry.ts";
import type { Point, Rectangle } from "./geometry.ts";

export type AnnotationTool =
  | "crop"
  | "pen"
  | "highlight"
  | "arrow"
  | "rect"
  | "ellipse"
  | "redact"
  | "text"
  | "step"
  | "pan";
export interface AnnotationAction {
  tool: AnnotationTool;
  points: Point[];
  color: string;
  width: number;
  text?: string;
  number?: number;
  crop?: Rectangle;
}
export const MAX_IMAGE_PIXELS = 40_000_000;
const UNDO_BYTES = 4 * 1024 * 1024;
const UNDO_ACTIONS = 256;

export function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  action: AnnotationAction,
) {
  const start = action.points[0];
  if (!start) return;
  const end = action.points[action.points.length - 1];
  const rectangle = boundedRectangle(start, end, Infinity, Infinity);
  ctx.save();
  ctx.strokeStyle = action.color;
  ctx.fillStyle = action.color;
  ctx.lineWidth = action.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (action.tool) {
    case "pen":
    case "highlight": {
      if (action.tool === "highlight") {
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = action.width * 5;
      }
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      if (action.points.length === 1) ctx.lineTo(start.x + 0.01, start.y);
      for (const point of action.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
      break;
    }
    case "rect":
      ctx.strokeRect(
        rectangle.x,
        rectangle.y,
        rectangle.width,
        rectangle.height,
      );
      break;
    case "ellipse":
      ctx.beginPath();
      ctx.ellipse(
        rectangle.x + rectangle.width / 2,
        rectangle.y + rectangle.height / 2,
        rectangle.width / 2,
        rectangle.height / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      break;
    case "arrow": {
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = Math.min(
        Math.max(12, action.width * 4),
        Math.hypot(end.x - start.x, end.y - start.y) / 2,
      );
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - head * Math.cos(angle - Math.PI / 6),
        end.y - head * Math.sin(angle - Math.PI / 6),
      );
      ctx.lineTo(
        end.x - head * Math.cos(angle + Math.PI / 6),
        end.y - head * Math.sin(angle + Math.PI / 6),
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "redact":
      // Solid opaque redaction removes information; pixelation may leave it recoverable.
      ctx.fillStyle = "#111111";
      ctx.fillRect(rectangle.x, rectangle.y, rectangle.width, rectangle.height);
      break;
    case "text": {
      const fontSize = Math.max(16, action.width * 5);
      ctx.font = `600 ${fontSize}px "Segoe UI", sans-serif`;
      ctx.textBaseline = "top";
      action.text
        ?.split("\n")
        .forEach((line, index) =>
          ctx.fillText(line, start.x, start.y + index * fontSize * 1.25),
        );
      break;
    }
    case "step": {
      const radius = Math.max(16, action.width * 4);
      ctx.beginPath();
      ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(2, action.width / 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${radius}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(action.number), start.x, start.y);
      break;
    }
  }
  ctx.restore();
}

function applyAction(canvas: HTMLCanvasElement, action: AnnotationAction) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image editing is unavailable in this window.");
  if (action.tool === "crop" && action.crop) {
    const { x, y, width, height } = action.crop;
    const pixels = ctx.getImageData(x, y, width, height);
    canvas.width = width;
    canvas.height = height;
    ctx.putImageData(pixels, 0, 0);
  } else drawAnnotation(ctx, action);
}

export class AnnotationDocument {
  readonly canvas = document.createElement("canvas");
  private readonly baseline = document.createElement("canvas");
  private actions: AnnotationAction[] = [];
  private baselineStep = 1;
  private undone: AnnotationAction[] = [];
  get canRedo() { return this.undone.length > 0; }
  snapshot() { return { version: 1, baseline: this.baseline.toDataURL("image/png"), actions: this.actions, undone: this.undone, baselineStep: this.baselineStep }; }
  static async restore(snapshot: ReturnType<AnnotationDocument["snapshot"]>) {
    if (snapshot.version !== 1 || snapshot.actions.length + snapshot.undone.length > 256) throw new Error("Draft format is unsupported");
    const image = new Image();
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Draft image could not load")); image.src = snapshot.baseline; });
    const result = new AnnotationDocument(image);
    result.actions = snapshot.actions; result.undone = snapshot.undone; result.baselineStep = snapshot.baselineStep; result.rebuild(); return result;
  }
  constructor(image: HTMLImageElement) {
    const width = image.naturalWidth,
      height = image.naturalHeight;
    if (!width || !height || width * height > MAX_IMAGE_PIXELS)
      throw new Error(
        "This image exceeds the 40 megapixel editing limit. Crop it in the source app first.",
      );
    if (width > 32767 || height > 32767)
      throw new Error(
        "This image exceeds the 32,767 pixel canvas limit. Split the capture into shorter images first.",
      );
    this.baseline.width = width;
    this.baseline.height = height;
    const ctx = this.baseline.getContext("2d");
    if (!ctx) throw new Error("Image editing is unavailable in this window.");
    ctx.drawImage(image, 0, 0);
    this.rebuild();
  }
  get canUndo() {
    return this.actions.length > 0;
  }
  get nextStep() {
    return nextStepNumber(this.actions, this.baselineStep);
  }
  commit(action: AnnotationAction) {
    this.undone = [];
    // Conservative allocation accounting includes point-object and array overhead.
    this.actions = trimUndoHistory(
      [...this.actions, action],
      (item) => 256 + item.points.length * 64 + (item.text?.length ?? 0) * 2,
      (item) => {
        applyAction(this.baseline, item);
        if (item.tool === "step")
          this.baselineStep = (item.number ?? this.baselineStep) + 1;
      },
      UNDO_BYTES,
      UNDO_ACTIONS,
    );
    applyAction(this.canvas, action);
  }
  undo() {
    const action = this.actions.pop();
    if(action) this.undone.push(action);
    this.rebuild();
  }
  redo() {
    const action = this.undone.pop();
    if (action) { this.actions.push(action); applyAction(this.canvas, action); }
  }
  exportPng(crop?: Rectangle | null) {
    if (!crop) return this.canvas.toDataURL("image/png");
    const {x, y, width, height} = crop;
    if (![x,y,width,height].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > this.canvas.width || y + height > this.canvas.height)
      throw new Error("The crop is outside the image.");
    const output = document.createElement("canvas");
    try {
      output.width = width; output.height = height;
      const pixels = this.canvas.getContext("2d")!.getImageData(x, y, width, height);
      output.getContext("2d")!.putImageData(pixels, 0, 0);
      return output.toDataURL("image/png");
    } finally { output.width = output.height = 0; }
  }
  dispose() {
    this.canvas.width =
      this.canvas.height =
      this.baseline.width =
      this.baseline.height =
        0;
    this.actions = [];
    this.undone = [];
  }
  private rebuild() {
    this.canvas.width = this.baseline.width;
    this.canvas.height = this.baseline.height;
    this.canvas.getContext("2d")!.drawImage(this.baseline, 0, 0);
    this.actions.forEach((action) => applyAction(this.canvas, action));
  }
}
