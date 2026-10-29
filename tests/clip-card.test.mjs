import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const code = ts.transpileModule(readFileSync(new URL("../src/components/ClipCard.tsx",import.meta.url),"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function card(type="image") {
  let opened=0, dragged=0;
  const jsx=(type,props)=>({type,props});
  const modules={react:{useRef:value=>({current:value})},"react/jsx-runtime":{jsx,jsxs:jsx},"lucide-react":new Proxy({},{get:(_,key)=>key}),"../lib/format":{formatBytes:()=>"10 KB",clipDate:()=>"now"},"../lib/useClipPreview":{useClipPreview:()=>"data:fixture"},"../lib/useNativeDrag":{useNativeDrag:start=>({onPointerMove:start})}};
  const exports={};new Function("require","exports",code)(name=>modules[name],exports);
  const tree=exports.ClipCard({clip:{id:"fixture",clip_type:type,char_count:100,created_at:new Date().toISOString()},onOpenPreview:()=>opened++,onNativeDrag:()=>dragged++});
  const nodes=[];const walk=n=>{if(Array.isArray(n))n.forEach(walk);else if(n&&typeof n==="object"){nodes.push(n);walk(n.props?.children);}};walk(tree);
  return {nodes,get opened(){return opened;},get dragged(){return dragged;}};
}
test("image and PDF previews open on click and keyboard, and a drag cannot open a preview",()=>{
  for(const type of ["image","file"]){
    const c=card(type),preview=c.nodes.find(n=>n.props?.className==="clip-image");
    assert.equal(preview.type,"button","Preview must be keyboard accessible");
    preview.props.onClick();assert.equal(c.opened,1);
    preview.props.onPointerMove();preview.props.onClick();
    assert.equal(c.dragged,1);assert.equal(c.opened,1,"Native drag must suppress its following click");
    assert.equal(c.nodes.some(n=>n.props?.["aria-label"]==="Drag clip to another app"),false);
  }
});
test("text retains its drag control and supports dragging its full content",()=>{
  const c=card("text"),text=c.nodes.find(n=>n.type==="p");
  assert.equal(typeof text.props.onPointerMove,"function");
  assert.ok(c.nodes.some(n=>n.props?.["aria-label"]==="Drag clip to another app"));
});
