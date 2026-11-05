import {useEffect, useRef, useState} from "react";
import type {LucideIcon} from "lucide-react";
import {Copy, Save, FileDown, X, RotateCcw, Redo2, Ellipsis, ZoomIn, ZoomOut} from "lucide-react";
import type {AnnotationTool} from "../annotation/document";
import type {Rectangle} from "../annotation/geometry";
import {regionToolbarLayout, captureScreen} from "../annotation/region-layout";

interface Props {
  selection: Rectangle | null;
  viewport: {width: number; height: number};
  screens?: readonly Rectangle[];
  tools: readonly {id: AnnotationTool; label: string; icon: LucideIcon}[];
  tool: AnnotationTool;
  onTool: (tool: AnnotationTool) => void;
  color: string;
  onColor: (color: string) => void;
  width: number;
  onWidth: (width: number) => void;
  text: string;
  onText: (text: string) => void;
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onZoom: (direction: number) => void;
  onFit: () => void;
  onExport: (action: "copy" | "save" | "pdf") => void;
  onClose: () => void;
}
const primary = new Set(["crop", "pen", "line", "arrow", "rect", "highlight", "text"]);
const colors = [{value:"#ef4444",name:"Red"},{value:"#f59e0b",name:"Amber"},{value:"#22c55e",name:"Green"},{value:"#3b82f6",name:"Blue"},{value:"#ffffff",name:"White"}];
export function RegionToolbar(props: Props) {
  const [open, setOpen] = useState<"color" | "more" | "text" | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(null);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {if (open === "text") textInput.current?.focus();}, [open]);
  const toggle = (value: typeof open, button: HTMLButtonElement) => {trigger.current = button; setOpen(current => current === value ? null : value);};
  const selectTool = (tool: AnnotationTool) => {props.onTool(tool); setOpen(tool === "text" ? "text" : null);};
  const screen=captureScreen(props.selection,props.screens ?? []);
  if (!props.selection) return <div className="region-prompt" style={screen ? {left:screen.x+screen.width/2,top:screen.y+8} : undefined}><span>Select area <kbd>Esc</kbd></span><button aria-label="Close area capture" title="Cancel (Escape)" onClick={props.onClose}><X size={15}/></button></div>;
  const layout = regionToolbarLayout(props.selection, props.viewport,screen);
  const toolButton = ({id, label, icon: Icon}: Props["tools"][number]) => <button key={id} aria-label={label} title={label} aria-pressed={props.tool === id} disabled={props.disabled} onClick={event => {trigger.current = event.currentTarget;selectTool(id);}}><Icon size={17}/></button>;
  return <div ref={root} className="region-toolbar">
    <div className="region-tool-strip" role="group" aria-label="Capture tools" style={{left:layout.tools.x,top:layout.tools.y,width:layout.tools.width,maxHeight:layout.tools.height}}>
      {props.tools.filter(tool => primary.has(tool.id)).map(toolButton)}
      <button aria-label="Color and stroke" title="Color and stroke" aria-expanded={open === "color"} disabled={props.disabled} onClick={event => toggle("color", event.currentTarget)}><span className="region-color" style={{backgroundColor:props.color}}/></button>
      <button aria-label="More tools" title="More tools and zoom" aria-expanded={open === "more"} disabled={props.disabled} onClick={event => toggle("more", event.currentTarget)}><Ellipsis size={18}/></button>
    </div>
    <div className="region-action-strip" role="group" aria-label="Capture actions" style={{left:layout.actions.x,top:layout.actions.y,width:layout.actions.width}}>
      <button aria-label="Undo last edit" title="Undo (Ctrl+Z)" disabled={props.disabled || !props.canUndo} onClick={props.onUndo}><RotateCcw size={16}/></button>
      <button aria-label="Redo last edit" title="Redo (Ctrl+Shift+Z)" disabled={props.disabled || !props.canRedo} onClick={props.onRedo}><Redo2 size={16}/></button>
      <button aria-label="Copy image" title="Copy image (Ctrl+C)" disabled={props.disabled} onClick={() => props.onExport("copy")}><Copy size={16}/></button>
      <button aria-label="Save image" title="Save image (Ctrl+S)" disabled={props.disabled} onClick={() => props.onExport("save")}><Save size={16}/></button>
      <button aria-label="Save PDF" title="Save PDF (Ctrl+P)" disabled={props.disabled} onClick={() => props.onExport("pdf")}><FileDown size={16}/></button>
      <button aria-label="Close area capture" title="Cancel (Escape)" disabled={props.disabled} onClick={props.onClose}><X size={17}/></button>
    </div>
    {open && <div className="region-tool-popover" data-region-popover role="group" aria-label={open === "text" ? "Text annotation" : open === "color" ? "Color and stroke" : "More capture tools"} style={{left:layout.popover.x,top:layout.popover.y}} onKeyDown={event => {
      if (event.key === "Escape") {event.preventDefault();event.stopPropagation();setOpen(null);trigger.current?.focus();}
    }}>
      {open === "text" ? <input ref={textInput} aria-label="Annotation text" value={props.text} maxLength={1000} placeholder="Type, then click the image" onChange={event => props.onText(event.target.value)} disabled={props.disabled}/>
      : open === "color" ? <><div className="region-color-options">{colors.map(color => <button key={color.value} aria-label={`${color.name} annotation color`} aria-pressed={props.color === color.value} onClick={() => props.onColor(color.value)}><span className="region-color" style={{backgroundColor:color.value}}/></button>)}</div><label>Stroke <select value={props.width} onChange={event => props.onWidth(Number(event.target.value))}><option value={2}>Thin</option><option value={4}>Medium</option><option value={8}>Thick</option><option value={16}>Bold</option></select></label></>
      : <><div className="region-extra-tools">{props.tools.filter(tool => !primary.has(tool.id)).map(tool => <button key={tool.id} aria-pressed={props.tool === tool.id} onClick={() => selectTool(tool.id)}><tool.icon size={16}/>{tool.label}</button>)}</div><div className="region-extra-zoom"><button aria-label="Zoom out" onClick={() => props.onZoom(-1)}><ZoomOut size={16}/></button><button onClick={props.onFit}>Fit</button><button aria-label="Zoom in" onClick={() => props.onZoom(1)}><ZoomIn size={16}/></button></div></>}
    </div>}
  </div>;
}
