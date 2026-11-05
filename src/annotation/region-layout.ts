import type {Rectangle} from "./geometry";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), value));
export function captureScreen(selection: Rectangle | null, screens: readonly Rectangle[]): Rectangle | undefined {
  if (!selection) return screens[0];
  const x=selection.x+selection.width-1,y=selection.y+selection.height-1;
  return screens.find(screen=>x>=screen.x && x<screen.x+screen.width && y>=screen.y && y<screen.y+screen.height)
    ?? [...screens].sort((a,b)=>Math.hypot(x-clamp(x,a.x,a.x+a.width),y-clamp(y,a.y,a.y+a.height))-Math.hypot(x-clamp(x,b.x,b.x+b.width),y-clamp(y,b.y,b.y+b.height)))[0];
}
export function regionToolbarLayout(selection: Rectangle, viewport: {width: number; height: number}, screen?: Rectangle): {tools:Rectangle;actions:Rectangle;popover:{x:number;y:number}} {
  if (screen) {
    const layout=regionToolbarLayout({...selection,x:selection.x-screen.x,y:selection.y-screen.y},screen);
    for(const item of [layout.tools,layout.actions,layout.popover]){item.x+=screen.x;item.y+=screen.y;}
    return layout;
  }
  const margin = 8, gap = 6, unit = 28;
  const availableWidth = Math.max(34, viewport.width - margin * 2);
  const columns = Math.min(6, Math.max(1, Math.floor((availableWidth - 6) / unit)));
  const actions = {x: 0, y: 0, width: columns * unit + 6, height: Math.ceil(6 / columns) * unit + 6};
  const tools = {x: 0, y: 0, width: 34, height: Math.min(258, Math.max(34, viewport.height - actions.height - gap - margin * 2))};
  const right = selection.x + selection.width, bottom = selection.y + selection.height;
  tools.x = right + gap + tools.width <= viewport.width - margin ? right + gap
    : selection.x - gap - tools.width >= margin ? selection.x - gap - tools.width
    : viewport.width - margin - tools.width;
  tools.x = clamp(tools.x, margin, viewport.width - margin - tools.width);
  tools.y = clamp(bottom - tools.height, margin, viewport.height - margin - tools.height);
  actions.x = clamp(right - actions.width, margin, viewport.width - margin - actions.width);
  actions.y = bottom + gap + actions.height <= viewport.height - margin ? bottom + gap
    : selection.y - gap - actions.height >= margin ? selection.y - gap - actions.height
    : viewport.height - margin - actions.height;
  actions.y = clamp(actions.y, margin, viewport.height - margin - actions.height);
  if (actions.x < tools.x + tools.width && actions.x + actions.width > tools.x && actions.y < tools.y + tools.height && actions.y + actions.height > tools.y) {
    actions.x = tools.x - gap - actions.width >= margin ? tools.x - gap - actions.width : tools.x + tools.width + gap;
    actions.x = clamp(actions.x, margin, viewport.width - margin - actions.width);
  }
  const popover = {x: clamp(tools.x > viewport.width / 2 ? tools.x - 222 : tools.x + tools.width + gap, margin, viewport.width - 224), y: clamp(tools.y, margin, viewport.height - 236)};
  return {tools, actions, popover};
}
