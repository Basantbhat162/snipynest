import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureController } from '../capture-core.mjs';

function harness(overrides = {}) {
  const events = [];
  let clock = 0;
  const adapter = {
    now: () => clock,
    sleep: async ms => { clock += ms; },
    getTab: async () => ({ id: 7, windowId: 3 }),
    prepare: async () => ({ viewportWidth: 1000, viewportHeight: 800, totalHeight: 1900, devicePixelRatio: 1 }),
    scroll: async (_, y) => ({ y: Math.min(y, 1100), viewportWidth: 1000, viewportHeight: 800 }),
    assertActive: async () => {},
    capture: async () => { events.push(['capture', clock]); return 'data:image/png;base64,frame'; },
    start: async () => events.push(['start']),
    append: async (_, frame) => events.push(['frame', frame.y]),
    finish: async () => ({ width: 1000, height: 1900 }),
    cleanup: async () => events.push(['cleanup']),
    release: async () => events.push(['release']),
    publish: () => {},
    ...overrides,
  };
  return { controller: createCaptureController(adapter), events };
}

test('full page streams overlapping final viewport once and respects capture quota', async () => {
  const { controller, events } = harness();
  const result = await controller.capture();
  assert.equal(result.success, true);
  assert.deepEqual(events.filter(e => e[0] === 'frame').map(e => e[1]), [0, 800, 1100]);
  const times = events.filter(e => e[0] === 'capture').map(e => e[1]);
  assert.ok(times[1] - times[0] >= 550);
  assert.ok(times[2] - times[1] >= 550);
  assert.deepEqual(events.slice(-2), [['cleanup'], ['release']]);
});

test('failure restores the page and releases image memory without copying partial capture', async () => {
  let copied = false;
  const { controller, events } = harness({ capture: async () => { throw new Error('Permission lost'); }, finish: async () => { copied = true; } });
  assert.deepEqual(await controller.capture(), { success: false, error: 'Permission lost' });
  assert.equal(copied, false);
  assert.deepEqual(events.slice(-2), [['cleanup'], ['release']]);
  assert.equal(controller.getStatus().busy, false);
});

test('oversized page is rejected before allocating a canvas and is restored', async () => {
  const { controller, events } = harness({ prepare: async () => ({ viewportWidth: 3840, viewportHeight: 1200, totalHeight: 30000, devicePixelRatio: 2 }) });
  assert.match((await controller.capture()).error, /too large/);
  assert.equal(events.some(e => e[0] === 'start'), false);
  assert.deepEqual(events.slice(-2), [['cleanup'], ['release']]);
});

test('changing active tab aborts before capturing a different page', async () => {
  const { controller, events } = harness({ assertActive: async () => { throw new Error('Keep the captured tab active.'); } });
  assert.equal((await controller.capture()).success, false);
  assert.equal(events.some(e => e[0] === 'capture'), false);
});

test('concurrent request is rejected and cancellation cleans up without clipboard write', async () => {
  let resume;
  let entered;
  const prepared = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  const { controller, events } = harness({ sleep: async () => { entered(); await gate; } });
  const first = controller.capture();
  await prepared;
  assert.match((await controller.capture()).error, /already running/);
  controller.cancel();
  resume();
  assert.match((await first).error, /cancelled/);
  assert.deepEqual(events.slice(-2), [['cleanup'], ['release']]);
});

test('resizing the viewport rejects a stitched image with incompatible frames', async () => {
  const { controller } = harness({ scroll: async () => ({ y: 0, viewportWidth: 900, viewportHeight: 800 }) });
  assert.match((await controller.capture()).error, /size changed/);
});

test('non-scrolling inner-scroll pages fail instead of silently returning a partial image', async () => {
  const { controller } = harness({ scroll: async () => ({ y: 0, viewportWidth: 1000, viewportHeight: 800 }) });
  assert.match((await controller.capture()).error, /Choose scrolling panel/);
});

test('capture pacing continues across subsequent capture requests', async () => {
  const { controller, events } = harness({ prepare: async () => ({ viewportWidth: 1000, viewportHeight: 800, totalHeight: 800, devicePixelRatio: 1 }) });
  await controller.capture();
  await controller.capture();
  const times = events.filter(e => e[0] === 'capture').map(e => e[1]);
  assert.ok(times[1] - times[0] >= 550);
});

test('fractional bottom rounding does not reject an otherwise complete page', async () => {
  const { controller } = harness({
    scroll: async (_, y) => ({ y: Math.min(y, 1099.5), viewportWidth: 1000, viewportHeight: 800 }),
  });
  const result = await controller.capture();
  assert.equal(result.success, true, result.error);
});

test('a transient stall retries and completes without losing the captured rows', async () => {
  let stalled = false;
  const {controller,events}=harness({scroll:async(_,y)=>{
    if(y===800 && !stalled){stalled=true;return {y:0,viewportWidth:1000,viewportHeight:800};}
    return {y:Math.min(y,1100),viewportWidth:1000,viewportHeight:800};
  }});
  assert.equal((await controller.capture()).success,true);
  assert.deepEqual(events.filter(e=>e[0]==='frame').map(e=>e[1]),[0,800,1100]);
});

test('permanent stall exposes an explicitly partial result and never calls full copy', async()=>{
  let full=false;
  const {controller}=harness({scroll:async()=>({y:0,viewportWidth:1000,viewportHeight:800}),
    finish:async()=>{full=true;},finishPartial:async()=>({resultAvailable:true,width:1000,height:800})});
  const result=await controller.capture();
  assert.equal(result.partial,true);assert.equal(result.copied,false);assert.equal(full,false);
  assert.match(result.warning,/Partial capture/);
});
