import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustCrop, initialCrop, cropChangesImage, cropEdges } from '../src/annotation/crop.ts';
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

test('locked left and top edges can shrink without moving the opposite edge', () => {
  const r = {x: 10, y: 10, width: 40, height: 40};
  assert.deepEqual(adjustCrop(r, 10, 0, 'w', 100, 100, 1), {x: 20, y: 15, width: 30, height: 30});
  assert.deepEqual(adjustCrop(r, 0, 10, 'n', 100, 100, 1), {x: 15, y: 20, width: 30, height: 30});
});
test('locked corner follows inward pointer movement', () => {
  assert.deepEqual(adjustCrop({x:10,y:10,width:40,height:40}, -10, 0, 'se', 100, 100, 1), {x:10,y:10,width:30,height:30});
});

test('initial guide fits the image and is not an unapplied edit until changed', () => {
  const whole = initialCrop(1920, 1080);
  assert.deepEqual(whole, {x:0,y:0,width:1920,height:1080});
  assert.equal(cropChangesImage(whole, 1920, 1080), false);
  assert.equal(cropChangesImage(initialCrop(1920,1080,1),1920,1080), true);
  assert.deepEqual(initialCrop(1920,1080,1), {x:420,y:0,width:1080,height:1080});
});
test('all crop edges remain integral, nonempty and inside the image across large drags', () => {
  let seed = 90210;
  const random = max => { seed = (1664525 * seed + 1013904223) >>> 0; return seed % max; };
  for (let i = 0; i < 600; i++) {
    const width = random(2000) + 1, height = random(2000) + 1;
    const x = random(width), y = random(height);
    const r = {x,y,width:random(width-x)+1,height:random(height-y)+1};
    for (const edge of [...cropEdges, 'move']) {
      const next = adjustCrop(r,random(8000)-4000,random(8000)-4000,edge,width,height,[0,1,16/9,4/3][i%4]);
      assert.ok(Object.values(next).every(Number.isInteger));
      assert.ok(next.x>=0 && next.y>=0 && next.width>=1 && next.height>=1);
      assert.ok(next.x+next.width<=width && next.y+next.height<=height);
    }
  }
});
