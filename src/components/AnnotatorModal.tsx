import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { readDraft, saveDraft, discardDraft } from "../annotation/drafts";
import { invoke } from "@tauri-apps/api/core";
import {
  Maximize2, Minimize2, Expand, Redo2,
  ArrowRight,
  Check,
  Circle,
  Copy,
  Crop,
  Hand,
  Hash,
  Highlighter,
  Pen,
  RotateCcw,
  Save,
  Shield,
  Square,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Clip } from "../types/clip";
import { AnnotationDocument, drawAnnotation } from "../annotation/document";
import type { AnnotationAction, AnnotationTool } from "../annotation/document";
import { adjustCrop, initialCrop, cropChangesImage, cropEdges } from "../annotation/crop";
import type { CropEdge } from "../annotation/crop";
import { boundedRectangle, imagePoint } from "../annotation/geometry";
import type { Rectangle } from "../annotation/geometry";
import "./Annotator.css";

interface AnnotatorModalProps {
  quickCrop?: boolean;
  clip: Clip | null;
  onClose: () => void;
  onSave: (dataBase64: string, originalId?: string) => Promise<void>;
  onCopyResult: (dataBase64: string) => Promise<void>;
}
const tools = [
  { id: "crop", label: "Crop", icon: Crop },
  { id: "pen", label: "Pen", icon: Pen },
  { id: "arrow", label: "Arrow", icon: ArrowRight },
  { id: "rect", label: "Box", icon: Square },
  { id: "ellipse", label: "Ellipse", icon: Circle },
  { id: "highlight", label: "Highlight", icon: Highlighter },
  { id: "redact", label: "Redact", icon: Shield },
  { id: "text", label: "Text", icon: Type },
  { id: "step", label: "Step", icon: Hash },
  { id: "pan", label: "Pan", icon: Hand },
] as const;
const palette = [
  { color: "#ef4444", label: "Red" },
  { color: "#f59e0b", label: "Amber" },
  { color: "#22c55e", label: "Green" },
  { color: "#3b82f6", label: "Blue" },
  { color: "#ffffff", label: "White" },
];
const edgeLabels: Record<Exclude<CropEdge, "move">, string> = {n: "top edge", e: "right edge", s: "bottom edge", w: "left edge", nw: "top left corner", ne: "top right corner", sw: "bottom left corner", se: "bottom right corner"};
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function AnnotatorModal({
  quickCrop = false,
  clip,
  onClose,
  onSave,
  onCopyResult,
}: AnnotatorModalProps) {
  const [mode, setMode] = useState<"inline"|"window"|"fullscreen">("inline");
  const [closePrompt, setClosePrompt] = useState(false);
  const closingRef = useRef(false);
  const promptRef = useRef<HTMLDivElement>(null);
  const spaceHeld = useRef(false);
  const switchMode = async (next: "inline"|"window"|"fullscreen") => {
    if (busyRef.current || gestureRef.current || cropDrag.current) return;
    try { await invoke("set_editor_mode", { mode: next }); setMode(next); }
    catch(e) { setError(messageOf(e)); }
  };
  const finishClose = async () => { await invoke("set_editor_mode", { mode: "inline" }); onClose(); };
  const previewRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<AnnotationDocument | null>(null);
  const gestureRef = useRef<{
    id: number;
    action: AnnotationAction;
    clientX: number;
    clientY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const frameRef = useRef<number | null>(null);
  const [tool, setTool] = useState<AnnotationTool>("crop");
  const [color, setColor] = useState("#ef4444");
  const [width, setWidth] = useState(4);
  const [text, setText] = useState("");
  const cropDrag = useRef<{id:number;x:number;y:number;rect:Rectangle;edge:CropEdge | "pan";scrollLeft:number;scrollTop:number}|null>(null);
  const [aspect, setAspect] = useState(0);
  const [cropMode, setCropMode] = useState<"adjust" | "draw">("adjust");
  const cropRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<Rectangle | null>(null);
  // null means Fit; otherwise zoom is absolute image scale and survives host resizing.
  const [zoom, setZoom] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"copy" | "save" | null>(null);
  const busyRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const image = documentRef.current?.canvas;
  const cropChanged = cropChangesImage(crop, image?.width ?? 0, image?.height ?? 0);
  const fit = image
    ? Math.min(
        1,
        Math.max(1, viewport.width - 32) / image.width,
        Math.max(1, viewport.height - 32) / image.height,
      )
    : 1;
  const scale = zoom ?? fit;
  const maxZoom = 4;
  const displayWidth = Math.max(1, Math.round((image?.width ?? 1) * scale));
  const displayHeight = Math.max(1, Math.round((image?.height ?? 1) * scale));
  const previewWidth = Math.min(displayWidth, Math.max(1, viewport.width));
  const previewHeight = Math.min(displayHeight, Math.max(1, viewport.height));

  useEffect(() => {
    if (!clip) return;
    let active = true;
    documentRef.current?.dispose();
    documentRef.current = null;
    gestureRef.current = null;
    cropDrag.current = null;
    closingRef.current = false;
    setTool("crop");
    setAspect(0);
    setCropMode("adjust");
    setLoading(true);
    setRevision(0);
    setError("");
    setStatus("");
    setCrop(null);
    setZoom(null);
    setDrawing(false);
    const load = async () => {
      try {
        const draft = quickCrop ? null : await readDraft();
        if (draft?.clip.id === clip.id) {
          const restored = await AnnotationDocument.restore(draft.document);
          if (!active) { restored.dispose(); return; }
          documentRef.current = restored; setCrop(draft.crop); setTool(draft.tool as AnnotationTool); setColor(draft.color); setWidth(draft.width); setText(draft.text);
          setStatus("Recovered your unfinished edit."); setRevision(2); return;
        }
        const source = await invoke<string | null>("get_clip_full_image", {
          id: clip.id,
        });
        if (!active) return;
        if (!source)
          throw new Error(
            "The original image is missing. Restore its blob or copy the image again.",
          );
        const loadedImage = new Image();
        await new Promise<void>((resolve, reject) => {
          loadedImage.onload = () => resolve();
          loadedImage.onerror = () =>
            reject(
              new Error(
                "The original image could not be decoded. Copy the image again.",
              ),
            );
          loadedImage.src = source;
        });
        if (!active) {
          loadedImage.src = "";
          return;
        }
        documentRef.current = new AnnotationDocument(loadedImage);
        setCrop(initialCrop(loadedImage.width, loadedImage.height));
        loadedImage.src = "";
        setRevision((value) => value + 1);
      } catch (loadError) {
        if (active) setError(messageOf(loadError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      documentRef.current?.dispose();
      documentRef.current = null;
    };
  }, [clip?.id, loadAttempt]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const paint = () => {
    const canvas = previewRef.current,
      current = documentRef.current?.canvas,
      container = containerRef.current;
    if (!canvas || !current || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    const canvasBounds = canvas.getBoundingClientRect(),
      imageBounds = container.getBoundingClientRect();
    ctx.scale(canvas.width / previewWidth, canvas.height / previewHeight);
    ctx.translate(
      imageBounds.left - canvasBounds.left,
      imageBounds.top - canvasBounds.top,
    );
    ctx.scale(displayWidth / current.width, displayHeight / current.height);
    ctx.drawImage(current, 0, 0);
    const gesture = gestureRef.current;
    if (
      gesture &&
      gesture.action.tool !== "crop" &&
      gesture.action.tool !== "pan"
    )
      drawAnnotation(ctx, gesture.action);
    ctx.restore();
  };
  const requestPaint = () => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paint();
    });
  };
  useLayoutEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !image) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(previewWidth * dpr));
    canvas.height = Math.max(1, Math.round(previewHeight * dpr));
    paint();
  }, [
    revision,
    displayWidth,
    displayHeight,
    previewWidth,
    previewHeight,
    loading,
  ]);
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const undo = () => {
    if (busyRef.current || gestureRef.current || !documentRef.current?.canUndo)
      return;
    documentRef.current.undo();
    setCrop(null);
    setStatus("");
    setRevision((value) => value + 1);
  };
  const applyCrop = () => {
    if (
      !crop ||
      crop.width < 1 ||
      crop.height < 1 ||
      !documentRef.current ||
      busyRef.current ||
      gestureRef.current ||
      cropDrag.current
    )
      return;
    if (!cropChanged) { setCrop(null); return; }
    documentRef.current.commit({
      tool: "crop",
      crop,
      points: [],
      color,
      width,
    });
    setCrop(null);
    setZoom(null);
    setStatus("Crop applied.");
    setRevision((value) => value + 1);
  };
  const cancelGesture = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture && previewRef.current?.hasPointerCapture(gesture.id))
      previewRef.current.releasePointerCapture(gesture.id);
    setDrawing(false);
    requestPaint();
  };
  const cancelCropGesture = (event?: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = cropDrag.current;
    if (!gesture || (event && gesture.id !== event.pointerId)) return;
    cropDrag.current = null;
    setCrop(gesture.rect);
    setDrawing(false);
    if (cropRef.current?.hasPointerCapture(gesture.id)) cropRef.current.releasePointerCapture(gesture.id);
  };
  const startCropGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!crop || !image || busyRef.current || gestureRef.current || cropDrag.current || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const edge = spaceHeld.current ? "pan" : (target.dataset.edge as CropEdge | undefined) ?? "move";
    target.closest<HTMLElement>("button, [tabindex]")?.focus();
    setDrawing(true);
    cropDrag.current = {id: event.pointerId, x: event.clientX, y: event.clientY, rect: crop, edge, scrollLeft: stageRef.current?.scrollLeft ?? 0, scrollTop: stageRef.current?.scrollTop ?? 0};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const updateCropGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = cropDrag.current;
    if (!gesture || gesture.id !== event.pointerId || !image) return;
    if (gesture.edge === "pan") {
      if (stageRef.current) {
        stageRef.current.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.x);
        stageRef.current.scrollTop = gesture.scrollTop - (event.clientY - gesture.y);
      }
      return;
    }
    setCrop(adjustCrop(gesture.rect, (event.clientX - gesture.x) / scale, (event.clientY - gesture.y) / scale, gesture.edge, image.width, image.height, aspect));
  };
  const finishCropGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (cropDrag.current?.id !== event.pointerId) return;
    updateCropGesture(event);
    cropDrag.current = null;
    setDrawing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const close = () => {
    if (busyRef.current || cropDrag.current) return;
    if (!quickCrop && (revision > 1 || cropChanged || text)) setClosePrompt(true);
    else void finishClose().catch(e => setError(messageOf(e)));
  };
  const keepDraft = async () => {
    if (!clip || !documentRef.current) return;
    try {
      await saveDraft({ clip, savedAt: Date.now(), document: documentRef.current.snapshot(), crop, tool, color, width, text });
      await finishClose();
    } catch(e) { setError("Draft could not be kept: " + messageOf(e)); }
  };
  useEffect(() => { const subscription = listen("editor-close-request", close); return () => { void subscription.then(f=>f()); }; });
  useEffect(() => {
    if (quickCrop || loading || (revision <= 1 && !cropChanged && !text) || !clip || !documentRef.current) return;
    const timer = setTimeout(() => { if (!closingRef.current && !gestureRef.current && !cropDrag.current && !busyRef.current && documentRef.current) void saveDraft({clip, savedAt:Date.now(),document:documentRef.current.snapshot(),crop,tool,color,width,text}).catch(e=>setError("Draft recovery unavailable: "+messageOf(e))); }, 900);
    return () => clearTimeout(timer);
  }, [revision, crop, tool, color, width, text, loading]);
  useEffect(() => { if(closePrompt) promptRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); }, [closePrompt]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (busyRef.current) return;
        if (closePrompt) { setClosePrompt(false); return; }
        if (cropDrag.current) {
          cancelCropGesture();
          return;
        }
        if (gestureRef.current) {
          cancelGesture();
          setCrop(null);
        } else if (quickCrop) close();
        else if (crop) setCrop(null);
        else if (mode === "fullscreen") void switchMode("window");
        else close();
      }
      const editing =
        event.target instanceof HTMLElement &&
        /INPUT|TEXTAREA|SELECT/.test(event.target.tagName);
      if (
        !editing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if(busyRef.current || gestureRef.current || cropDrag.current || closePrompt) return;
        if(event.shiftKey) { documentRef.current?.redo(); setRevision(v=>v+1); } else undo();
      }
      if (!editing && event.code === "Space") { spaceHeld.current = true; event.preventDefault(); }
      if (event.key === "F11") { event.preventDefault(); void switchMode(mode === "fullscreen" ? "window" : "fullscreen"); }
      if (!editing && event.ctrlKey && event.key === "s") { event.preventDefault(); void exportImage("save"); }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); event.stopImmediatePropagation(); void exportImage("copy"); }
      if (!editing && event.ctrlKey && ["0","1"].includes(event.key) && !busyRef.current && !gestureRef.current && !cropDrag.current && !closePrompt) { event.preventDefault(); setZoom(event.key === "0" ? null : 1); }
      if (!editing && crop && image && event.key.startsWith("Arrow")) {
        event.preventDefault();
        if (busyRef.current || gestureRef.current || cropDrag.current || closePrompt) return;
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        const edge = event.target instanceof HTMLElement ? event.target.dataset.edge as CropEdge | undefined : undefined;
        setCrop(adjustCrop(crop, dx, dy, edge ?? "move", image.width, image.height, aspect));
      }
      const activatingButton =
        event.target instanceof HTMLElement && !!event.target.closest("button");
      if (
        !editing &&
        !activatingButton &&
        event.key === "Enter" &&
        tool === "crop" &&
        crop
      ) {
        event.preventDefault();
        applyCrop();
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          (closePrompt ? promptRef.current : modalRef.current)?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']",
          ) ?? [],
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === modalRef.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === modalRef.current)
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const releaseSpace=()=>{spaceHeld.current=false;};
    const blur = () => { releaseSpace(); cancelCropGesture(); if (gestureRef.current) { if (gestureRef.current.action.tool === "crop") setCrop(null); cancelGesture(); } };
    window.addEventListener("keydown", keydown, true); window.addEventListener("keyup",releaseSpace); window.addEventListener("blur",blur);
    return () => { window.removeEventListener("keydown", keydown, true); window.removeEventListener("keyup",releaseSpace); window.removeEventListener("blur",blur); };
  });

  const pointFor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = documentRef.current!.canvas;
    return imagePoint(
      event.clientX,
      event.clientY,
      containerRef.current!.getBoundingClientRect(),
      current.width,
      current.height,
    );
  };
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (
      !documentRef.current ||
      busyRef.current ||
      gestureRef.current ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    setStatus("");
    setError("");
    const point = pointFor(event);
    const action: AnnotationAction = { tool: spaceHeld.current ? "pan" : tool, points: [point], color, width };
    if (action.tool === "text" || action.tool === "step") {
      if (action.tool === "text" && !text.trim()) {
        setStatus("Enter your text above, then click the image to place it.");
        return;
      }
      action.text = text.trim();
      action.number = documentRef.current.nextStep;
      documentRef.current.commit(action);
      setRevision((value) => value + 1);
      return;
    }
    if (action.tool === "crop") setCrop(null);
    const stage = stageRef.current!;
    gestureRef.current = {
      id: event.pointerId,
      action,
      clientX: event.clientX,
      clientY: event.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    };
    setDrawing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    requestPaint();
  };
  const updateGesture = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    if (gesture.action.tool === "pan") {
      const stage = stageRef.current!;
      stage.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.clientX);
      stage.scrollTop = gesture.scrollTop - (event.clientY - gesture.clientY);
      return;
    }
    const point = pointFor(event),
      action = gesture.action;
    if (action.tool === "pen" || action.tool === "highlight") {
      const last = action.points[action.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) < 0.5) return;
      action.points.push(point);
      if (action.points.length >= 4096)
        action.points = action.points.filter(
          (_, index) => index === 0 || index % 2 === 1,
        );
    } else action.points = [action.points[0], point];
    if (action.tool === "crop") {
      const rect=boundedRectangle(action.points[0],point,documentRef.current!.canvas.width,documentRef.current!.canvas.height);
      if(aspect>0){ const w=Math.min(rect.width,rect.height*aspect);rect.width=Math.max(1,Math.floor(w));rect.height=Math.max(1,Math.floor(w/aspect)); }
      setCrop(rect);
    }
    else requestPaint();
  };
  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    updateGesture(event);
    gestureRef.current = null;
    setDrawing(false);
    if (gesture.action.tool !== "crop" && gesture.action.tool !== "pan") {
      const first = gesture.action.points[0],
        last = gesture.action.points[gesture.action.points.length - 1];
      if (
        gesture.action.tool === "pen" ||
        gesture.action.tool === "highlight" ||
        Math.hypot(last.x - first.x, last.y - first.y) > 1
      ) {
        documentRef.current!.commit(gesture.action);
        setRevision((value) => value + 1);
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    requestPaint();
  };
  const exportImage = async (action: "copy" | "save") => {
    if (!documentRef.current || busyRef.current || gestureRef.current || cropDrag.current || closePrompt) return;
    if (cropChanged && !quickCrop) {
      setStatus("Apply or cancel the crop before exporting.");
      return;
    }
    busyRef.current = true;
    setBusy(action);
    setError("");
    setStatus("");
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      );
      const png = documentRef.current.exportPng(quickCrop ? crop : null);
      if (action === "copy") {
        await onCopyResult(png);
        setStatus("Image copied.");
      } else {
        await onSave(png, clip?.id);
        closingRef.current = true;
        try { if (!quickCrop) await discardDraft(clip?.id); await finishClose(); }
        catch(e) { setStatus("Image saved to history."); setError("Image saved, but the editor could not finish closing: " + messageOf(e)); }
      }
    } catch (exportError) {
      setError(
        `${action === "copy" ? "Copy" : "Save"} failed: ${messageOf(exportError)}`,
      );
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  if (!clip) return null;
  const ready = !loading && !!image;
  const toolHint =
    tool === "crop"
      ? crop ? quickCrop ? "Drag edges or draw an area. Ctrl+C copies the selection; Ctrl+S saves it." : "Drag any edge or corner to resize. Arrow keys move; focus a handle to resize. Enter applies." : "Draw an area on the image, or choose Adjust edges to start from the full image."
      : tool === "text"
        ? "Enter text, then click the image to place it."
        : tool === "step"
          ? `Click to place step ${documentRef.current?.nextStep ?? 1}.`
          : tool === "pan"
            ? "Zoom in, then drag to move around the image."
            : tool === "redact"
              ? "Drag a solid block over information to remove it."
              : "Drag on the image to annotate. Ctrl+Z undoes.";
  return (
    <div
      className="annotator"
      role="dialog"
      aria-modal="true"
      aria-labelledby="annotator-title"
      tabIndex={-1}
      ref={modalRef}
    >
      <header className="annotator-header">
        <div>
          <h2 id="annotator-title">{quickCrop ? "Quick crop" : "Edit image"}</h2>
          <span>
            {image
              ? `${image.width.toLocaleString()} × ${image.height.toLocaleString()} px`
              : "Original resolution"}
          </span>
        </div>
        <div className="annotator-header-actions">
          <button aria-label={mode === "inline" ? "Open editor in maximized window" : "Return to sidebar"} title={mode === "inline" ? "Open maximized window" : "Return to sidebar"} onClick={() => void switchMode(mode === "inline" ? "window" : "inline")} disabled={!!busy || drawing}>{mode === "inline" ? <Maximize2 size={17}/> : <Minimize2 size={17}/>}</button>
          <button aria-label="Toggle fullscreen editor" title="Fullscreen (F11)" onClick={()=>void switchMode(mode==="fullscreen"?"window":"fullscreen")} disabled={!!busy || drawing}><Expand size={17}/></button>
          <button aria-label="Redo last edit" title="Redo (Ctrl+Shift+Z)" disabled={!documentRef.current?.canRedo || !!busy || drawing} onClick={()=>{documentRef.current?.redo();setRevision(v=>v+1);}}><Redo2 size={17}/></button>
          <button
            aria-label="Undo last edit (Ctrl+Z)"
            title="Undo (Ctrl+Z)"
            onClick={undo}
            disabled={!documentRef.current?.canUndo || !!busy || drawing}
          >
            <RotateCcw size={17} />
          </button>
          <button
            aria-label="Close image editor"
            title="Close (Escape)"
            onClick={close}
            disabled={!!busy}
          >
            <X size={19} />
          </button>
        </div>
      </header>
      <div className="annotator-tools" role="group" aria-label="Image tools">
        {tools.filter(item => !quickCrop || item.id === "crop" || item.id === "pan").map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-pressed={tool === id}
            disabled={!ready || !!busy || drawing}
            onClick={() => {
              setTool(id);
              setCrop(id === "crop" && image ? initialCrop(image.width, image.height, aspect) : null);
              if (id === "crop") setCropMode("adjust");
              setStatus("");
            }}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="annotator-options">
        {tool !== "crop" && <><div className="annotator-palette" role="group" aria-label="Annotation color">
          {palette.map((item) => (
            <button
              key={item.color}
              aria-label={`${item.label} annotation color`}
              aria-pressed={color === item.color}
              disabled={!ready || !!busy || drawing}
              onClick={() => setColor(item.color)}
            >
              <span style={{ backgroundColor: item.color }} />
              {color === item.color && <Check size={12} />}
            </button>
          ))}
        </div>
        <label>
          Stroke{" "}
          <select
            value={width}
            disabled={!ready || !!busy || drawing}
            onChange={(event) => setWidth(Number(event.target.value))}
          >
            <option value={2}>Thin</option>
            <option value={4}>Medium</option>
            <option value={8}>Thick</option>
            <option value={16}>Bold</option>
          </select>
        </label>
        </>}
        {tool === "crop" && <div className="annotator-crop-modes" role="group" aria-label="Crop method">
          <button aria-pressed={cropMode === "adjust"} disabled={!ready || !!busy || drawing} onClick={() => { setCropMode("adjust"); setCrop(initialCrop(image!.width, image!.height, aspect)); }}>Adjust edges</button>
          <button aria-pressed={cropMode === "draw"} disabled={!ready || !!busy || drawing} onClick={() => { setCropMode("draw"); setCrop(null); }}>Draw area</button>
        </div>}
        <div className="annotator-zoom" role="group" aria-label="Image zoom">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(fit, (value ?? fit) / 1.5))}
            disabled={!ready || zoom === null || drawing}
          >
            <ZoomOut size={16} />
          </button>
          <button
            title={zoom === null ? "View image at 100%" : "Fit image in editor"}
            onClick={() => setZoom(zoom === null ? 1 : null)}
            disabled={!ready || drawing}
          >
            {zoom === null ? "Fit" : `${Math.round(scale * 100)}%`}
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(maxZoom, (value ?? fit) * 1.5))}
            disabled={!ready || scale >= maxZoom || drawing}
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>
      {tool === "text" && (
        <label className="annotator-text">
          Annotation text
          <textarea
            value={text}
            maxLength={1000}
            placeholder="Type a label…"
            rows={2}
            disabled={!!busy}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
      )}
      <p className="annotator-hint">{toolHint}</p>
      <div
        className={`annotator-stage ${tool === "pan" ? "is-pan" : ""}`}
        ref={stageRef}
        onScroll={requestPaint}
      >
        {loading && (
          <p className="annotator-loading" role="status">
            Loading original image…
          </p>
        )}
        {!loading && !image && (
          <div className="annotator-load-error">
            <p>Image unavailable</p>
            <button onClick={() => setLoadAttempt((value) => value + 1)}>
              Try again
            </button>
          </div>
        )}
        <div
          className="annotator-canvas-container"
          ref={containerRef}
          style={{
            width: displayWidth,
            height: displayHeight,
            visibility: ready ? "visible" : "hidden",
          }}
        >
          <canvas
            ref={previewRef}
            style={{ width: previewWidth, height: previewHeight }}
            aria-label="Image annotation canvas"
            onPointerDown={pointerDown}
            onPointerMove={updateGesture}
            onPointerUp={pointerUp}
            onPointerCancel={() => {
              cancelGesture();
              setCrop(null);
            }}
            onLostPointerCapture={() => {
              if (gestureRef.current) {
                cancelGesture();
                setCrop(null);
              }
            }}
          />
          {crop && image && (
            <div
              className="annotator-crop"
              ref={cropRef}
              tabIndex={0}
              role="group"
              aria-label="Crop selection. Arrow keys move the selection; focus an edge to resize."
              style={{
                left: crop.x * scale,
                top: crop.y * scale,
                width: crop.width * scale,
                height: crop.height * scale,
              }}
              onPointerDown={startCropGesture}
              onPointerMove={updateCropGesture}
              onPointerUp={finishCropGesture}
              onPointerCancel={cancelCropGesture}
              onLostPointerCapture={cancelCropGesture}
            >
              {cropEdges.map(edge => <button
                type="button"
                key={edge}
                data-edge={edge}
                aria-label={`Resize crop ${edgeLabels[edge]}`}
                title={`Resize ${edgeLabels[edge]} · arrow keys, Shift for 10 pixels`}
                disabled={!!busy}
                className={"crop-handle " + edge}
              />)}
              <span>
                {crop.width} × {crop.height}
              </span>
            </div>
          )}
        </div>
      </div>
      {tool === "crop" && (
        <div className="annotator-crop-actions">
          <label>Ratio <select value={aspect} disabled={!!busy || drawing || !ready} onChange={e=>{ const next = Number(e.target.value); setAspect(next); if (crop) { const fitted = initialCrop(crop.width, crop.height, next); setCrop({...fitted, x: crop.x + fitted.x, y: crop.y + fitted.y}); } }}><option value={0}>Free</option><option value={1}>1:1</option><option value={16/9}>16:9</option><option value={4/3}>4:3</option></select></label>
          <span>
            {crop ? `${crop.width} × ${crop.height} px` : "Select an area"}
          </span>
          <button onClick={() => setCrop(null)} disabled={!!busy || drawing || !crop}>
            Cancel crop
          </button>
          <button
            className="is-primary"
            onClick={applyCrop}
            disabled={!!busy || drawing || !crop || crop.width < 1 || crop.height < 1}
          >
            <Check size={16} />
            Apply crop
          </button>
        </div>
      )}
      <div className="annotator-feedback" aria-live="polite">
        {error ? (
          <p role="alert" className="annotator-error">
            {error}
          </p>
        ) : status ? (
          <p>{status}</p>
        ) : (
          <p>
            {quickCrop ? "Select an area. Ctrl+C copies it; Ctrl+S saves a new image. Close leaves the original unchanged." : "Save creates a new image in history. The original stays available."}
          </p>
        )}
      </div>
      {closePrompt && <div ref={promptRef} className="annotator-close-prompt" role="alertdialog" aria-modal="true" aria-label="Keep unfinished edit?"><p>Keep this unfinished edit for later?</p><button onClick={()=>setClosePrompt(false)}>Continue editing</button><button onClick={()=>void keepDraft()}>Keep draft & close</button><button onClick={()=>{closingRef.current=true;void discardDraft(clip?.id).then(finishClose).catch(e=>{closingRef.current=false;setError(messageOf(e));});}}>Discard & close</button></div>}
      <footer className="annotator-footer">
        <button onClick={close} disabled={!!busy}>
          Cancel
        </button>
        <button
          onClick={() => void exportImage("copy")}
          disabled={!ready || !!busy || drawing || (!quickCrop && cropChanged)}
          title="Copy image (Ctrl+C)"
        >
          <Copy size={16} />
          {busy === "copy" ? "Copying…" : "Copy image"}
        </button>
        <button
          className="is-primary"
          onClick={() => void exportImage("save")}
          disabled={!ready || !!busy || drawing || (!quickCrop && cropChanged)}
        >
          <Save size={16} />
          {busy === "save" ? "Saving…" : "Save image"}
        </button>
      </footer>
    </div>
  );
}
