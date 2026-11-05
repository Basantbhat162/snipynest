import test from "node:test";
import assert from "node:assert/strict";
import {regionToolbarLayout, captureScreen} from "../src/annotation/region-layout.ts";

test("capture tools sit beside the selection and actions sit below it", () => {
  const {tools,actions}=regionToolbarLayout({x:100,y:80,width:600,height:450},{width:1920,height:1080});
  assert.equal(tools.width,34); assert.equal(tools.x,706);
  assert.equal(actions.y,536); assert.ok(actions.width<200);
});

test("tool strips stay visible and separate at all screen edges, zoom offsets and small selections", () => {
  for (const viewport of [{width:320,height:240},{width:800,height:600},{width:1920,height:1080}]) {
    for (const x of [-500,0,10,viewport.width-60]) for (const y of [-500,0,10,viewport.height-40]) {
      for (const size of [30,300,3000]) {
        const {tools,actions}=regionToolbarLayout({x,y,width:size,height:size},viewport);
        for (const rect of [tools,actions]) {
          assert.ok(rect.x>=8 && rect.y>=8);
          assert.ok(rect.x+rect.width<=viewport.width-8);
          assert.ok(rect.y+rect.height<=viewport.height-8);
        }
        const overlap=tools.x<actions.x+actions.width && tools.x+tools.width>actions.x && tools.y<actions.y+actions.height && tools.y+tools.height>actions.y;
        assert.equal(overlap,false,JSON.stringify({viewport,tools,actions}));
      }
    }
  }
});
test("spanning selection attaches controls to a real display rather than a desktop gap",()=>{
 const screens=[{x:0,y:300,width:900,height:600},{x:900,y:0,width:1200,height:900},{x:2100,y:200,width:800,height:600}];
 const selection={x:300,y:450,width:2300,height:250};
 const screen=captureScreen(selection,screens);
 assert.equal(screen,screens[2]);
 const layout=regionToolbarLayout(selection,{width:2900,height:900},screen);
 for(const r of [layout.tools,layout.actions])assert.ok(r.x>=screen.x&&r.y>=screen.y&&r.x+r.width<=screen.x+screen.width&&r.y+r.height<=screen.y+screen.height);
 assert.equal(captureScreen(null,screens),screens[0]);
 assert.ok(captureScreen({x:0,y:0,width:200,height:100},screens));
});
