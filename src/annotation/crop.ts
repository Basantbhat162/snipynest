import type { Rectangle } from "./geometry";
export function adjustCrop(r: Rectangle, dx: number, dy: number, edge: string, width: number, height: number, aspect = 0): Rectangle {
  const clamp=(n:number,min:number,max:number)=>Math.round(Math.max(min,Math.min(max,n)));
  if(edge==="move") return {...r,x:clamp(r.x+dx,0,width-r.width),y:clamp(r.y+dy,0,height-r.height)};
  let left=r.x, top=r.y, right=r.x+r.width, bottom=r.y+r.height;
  if(edge.includes("w"))left=clamp(left+dx,0,right-1);
  if(edge.includes("e"))right=clamp(right+dx,left+1,width);
  if(edge.includes("n"))top=clamp(top+dy,0,bottom-1);
  if(edge.includes("s"))bottom=clamp(bottom+dy,top+1,height);
  if (aspect > 0) {
    const west = edge.includes("w"), north = edge.includes("n");
    const anchorX = west ? r.x+r.width : r.x;
    const anchorY = north ? r.y+r.height : r.y;
    const maxWidth = west ? anchorX : width-anchorX;
    const maxHeight = north ? anchorY : height-anchorY;
    const w = Math.max(1,Math.floor(Math.min(Math.max(right-left,(bottom-top)*aspect),maxWidth,maxHeight*aspect)));
    const h = Math.max(1,Math.round(w/aspect));
    return {x:west?anchorX-w:anchorX,y:north?anchorY-h:anchorY,width:w,height:h};
  }
  return {x:left,y:top,width:right-left,height:bottom-top};
}
