import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustCrop } from '../src/annotation/crop.ts';
test('crop adjustment remains in image bounds',()=>{
assert.deepEqual(adjustCrop({x:10,y:10,width:20,height:20},100,100,'move',50,50),{x:30,y:30,width:20,height:20});
assert.deepEqual(adjustCrop({x:10,y:10,width:20,height:20},-100,-100,'nw',50,50),{x:0,y:0,width:30,height:30});
});
test('locked crop corners preserve ratio and opposite anchor within bounds',()=>{
const r={x:10,y:10,width:20,height:20};
const next=adjustCrop(r,100,3,'se',60,50,1);
assert.deepEqual(next,{x:10,y:10,width:40,height:40});
const nw=adjustCrop(r,-100,-3,'nw',60,50,2);
assert.equal(nw.x+nw.width,30);assert.equal(nw.y+nw.height,30);
assert.ok(Math.abs(nw.width/nw.height-2)<0.1);
});
