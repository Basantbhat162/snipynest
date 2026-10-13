import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const styles = new Map();
function pageNode(position, top = 'auto', boundsTop = 0) {
  const values = new Map([['visibility', ['visible', 'important']]]);
  return {
    position, top,
    style: {
      getPropertyValue: key => values.get(key)?.[0] || '',
      getPropertyPriority: key => values.get(key)?.[1] || '',
      setProperty: (key, value, priority) => values.set(key, [value, priority]),
      removeProperty: key => values.delete(key),
    },
    getBoundingClientRect: () => ({ top: boundsTop, bottom: boundsTop + 50 }),
  };
}
const fixed = pageNode('fixed');
const stickyInFlow = pageNode('sticky', '0px', 500);
let listener;
let failCapture = false;
let focused = true;
let currentUrl = 'https://example.test/page';
let offscreenOpen = false;
let frames = [];
let metrics;
globalThis.window = {
  innerWidth: 1000, innerHeight: 800, devicePixelRatio: 1, scrollX: 42, scrollY: 300,
  scrollTo({ left, top }) { this.scrollX = left; this.scrollY = Math.min(top, 1100); },
};
globalThis.document = {
  body: { scrollHeight: 1900, offsetHeight: 1900 },
  documentElement: { scrollHeight: 1900, offsetHeight: 1900 },
  head: { append(node) { styles.set(node, true); } },
  createElement: () => ({ remove() { styles.delete(this); } }),
  querySelectorAll: () => [fixed, stickyInFlow],
};
globalThis.getComputedStyle = node => ({ position: node.position, top: node.top, bottom: 'auto' });
globalThis.chrome = {
  runtime: {
    id: 'companion', getURL: path => `chrome-extension://companion/${path}`,
    getContexts: async () => offscreenOpen ? [{}] : [],
    sendMessage: async message => {
      if (message.target !== 'offscreen') return {};
      if (message.action === 'start') { frames = []; metrics = message.data; }
      if (message.action === 'append') frames.push(message.data.y);
      return { success: true, width: 1000, height: 1900 };
    },
    onMessage: { addListener(callback) { listener = callback; } },
  },
  scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] },
  tabs: {
    query: async () => [{ id: 7, windowId: 3, url: currentUrl }],
    captureVisibleTab: async () => { if (failCapture) throw new Error('Capture permission was revoked'); return 'data:image/png;base64,frame'; },
  },
  windows: { get: async () => ({ focused }) },
  offscreen: {
    createDocument: async () => { offscreenOpen = true; },
    closeDocument: async () => { offscreenOpen = false; },
  },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
  commands: { onCommand: { addListener() {} } },
};
await import('../background.js');
function request(action, options = {}) { return new Promise(resolve => listener({ action, ...options }, { id: 'companion' }, resolve)); }

test('clipboard failure retains the PNG without opening or focusing a result tab', async () => {
  const send = chrome.runtime.sendMessage, contexts = chrome.runtime.getContexts;
  let popup = false;
  const opened = [];
  chrome.tabs.create = async options => { opened.push(options); };
  chrome.runtime.getContexts = async options => options.contextTypes.includes('POPUP') ? (popup ? [{}] : []) : contexts(options);
  chrome.runtime.sendMessage = async message => message.target === 'offscreen' && message.action === 'finish'
    ? {success:true,copied:false,resultAvailable:true,width:1000,height:800}
    : send(message);
  try {
    assert.equal((await request('capture-full-page',{mode:'visible'})).success,true);
    assert.deepEqual(opened,[]);
    popup = true;
    await request('capture-full-page',{mode:'visible'});
    assert.equal(opened.length,0);
  } finally {chrome.runtime.sendMessage=send;chrome.runtime.getContexts=contexts;offscreenOpen=false;}
});

test('capture allows animation to render and preserves large pinned scenes', async () => {
  const query = document.querySelectorAll, capture = chrome.tabs.captureVisibleTab;
  const scene = pageNode('fixed');
  scene.getBoundingClientRect=()=>({width:1000,height:700,top:0,bottom:700});
  document.querySelectorAll=()=>[fixed,scene];
  chrome.tabs.captureVisibleTab=async()=>{
    assert.equal(scene.style.getPropertyValue('visibility'),'visible');
    assert.doesNotMatch(window.__omnicopyCapture.style.textContent,/animation-play-state:paused/);
    return 'data:image/png;base64,frame';
  };
  try {
    const result = await request('capture-full-page',{slow:true});
    assert.equal(result.success,true,result.error);
    assert.equal(metrics.settleMs,1400);
  } finally {document.querySelectorAll=query;chrome.tabs.captureVisibleTab=capture;}
});

test('normal pages use the actual scrolling element instead of overflowing body dimensions', async () => {
  document.scrollingElement = {scrollHeight:1900};
  document.body.offsetHeight = 3000;
  try {
    const result = await request('capture-full-page');
    assert.equal(result.success,true,result.error);
    assert.equal(metrics.totalHeight,1900);
  } finally {document.body.offsetHeight=1900;delete document.scrollingElement;}
});

test('Chrome adapter restores horizontal/vertical position, pinned visibility, styles, and offscreen document', async () => {
  const result = await request('capture-full-page');
  assert.equal(result.success, true);
  assert.deepEqual(frames, [0, 800, 1100]);
  assert.equal(window.scrollX, 42);
  assert.equal(window.scrollY, 300);
  assert.equal(window.__omnicopyCapture, undefined);
  assert.equal(styles.size, 0);
  assert.equal(offscreenOpen, false);
  assert.equal(fixed.style.getPropertyValue('visibility'), 'visible');
  assert.equal(fixed.style.getPropertyPriority('visibility'), 'important');
  assert.equal(stickyInFlow.style.getPropertyValue('visibility'), 'visible');
});

test('Chrome adapter restores modified page on capture API failure', async () => {
  failCapture = true;
  assert.match((await request('capture-full-page')).error, /permission was revoked/);
  assert.equal(window.scrollY, 300);
  assert.equal(window.scrollX, 42);
  assert.equal(styles.size, 0);
  assert.equal(window.__omnicopyCapture, undefined);
  assert.equal(offscreenOpen, false);
});

test('extension popup uses MV3-compatible external scripts and module worker/offscreen', async () => {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const popup = await readFile(new URL('popup.html', root), 'utf8');
  const offscreen = await readFile(new URL('offscreen.html', root), 'utf8');
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.minimum_chrome_version, '116');
  assert.match(popup, /<script src="popup\.js" defer><\/script>/);
  assert.doesNotMatch(popup, /<script>/);
  assert.doesNotMatch(popup, /onclick=/);
  assert.match(offscreen, /type="module" src="offscreen\.js"/);
});

 test('focus changes and same-document URL changes do not discard the capture', async () => {
   failCapture = false; focused = false;
   const originalScroll = window.scrollTo;
   window.scrollTo = function(position) { originalScroll.call(this, position); currentUrl = 'https://example.test/page#section'; };
   const result = await request('capture-full-page');
   assert.equal(result.success, true, result.error);
   window.scrollTo = originalScroll; focused = true;
 });

test('visible capture preserves the current scroll and captures just one viewport', async () => {
  failCapture = false;
  const result = await request('capture-full-page', {mode:'visible'});
  assert.equal(result.success,true,result.error);
  assert.equal(metrics.totalHeight,800);
  assert.deepEqual(frames,[0]);
  assert.equal(window.scrollY,300);
  assert.equal(window.scrollX,42);
});

test('feed capture is bounded to five viewports and restores the page', async () => {
  const originalScroll=window.scrollTo;
  const originalHeight=document.documentElement.scrollHeight;
  document.documentElement.scrollHeight=100000;
  window.scrollTo=function({left,top}){this.scrollX=left;this.scrollY=top;};
  try {
    const result=await request('capture-full-page',{mode:'feed'});
    assert.equal(result.success,true,result.error);
    assert.equal(metrics.totalHeight,4000);
    assert.deepEqual(frames,[0,800,1600,2400,3200]);
    assert.equal(window.scrollY,300);
  } finally {window.scrollTo=originalScroll;document.documentElement.scrollHeight=originalHeight;}
});

test('selected scroll panel captures its own bounds and restores its original position',async()=>{
  const panel={scrollHeight:1050,clientHeight:400,clientWidth:500,clientLeft:2,clientTop:2,scrollTop:75,
    getBoundingClientRect:()=>({left:98,top:98}),parentElement:document.body};
  let scrollTop=75;
  Object.defineProperty(panel,'scrollTop',{get:()=>scrollTop,set:value=>{scrollTop=Math.min(value,650);}});
  const originalCreate=document.createElement, originalStyle=globalThis.getComputedStyle;
  document.createElement=()=>({style:{},remove(){styles.delete(this);}});
  document.documentElement.append=node=>styles.set(node,true);
  document.addEventListener=(kind,handler)=>{if(kind==='click')queueMicrotask(()=>handler({target:panel,preventDefault(){},stopPropagation(){}}));};
  document.removeEventListener=()=>{};
  globalThis.getComputedStyle=node=>node===panel?{overflowY:'auto'}:originalStyle(node);
  try {
    const result=await request('capture-full-page',{mode:'region'});
    assert.equal(result.success,true,result.error);
    assert.deepEqual(frames,[0,400,650]);
    assert.deepEqual(metrics.region,{x:100,y:100,width:500,height:400,windowWidth:1000,windowHeight:800});
    assert.equal(panel.scrollTop,75);
    assert.equal(window.scrollY,300);
    assert.equal(styles.size,0);
  } finally {document.createElement=originalCreate;globalThis.getComputedStyle=originalStyle;}
});

test('manual scrolling during a screenshot aborts rather than stitching wrong rows',async()=>{
  const original=chrome.tabs.captureVisibleTab;
  chrome.tabs.captureVisibleTab=async()=>{window.scrollY+=40;return 'data:image/png;base64,frame';};
  try {
    const result=await request('capture-full-page');
    assert.equal(result.success,false);
    assert.match(result.error,/scroll|moved/i);
    assert.equal(window.scrollY,300);
  } finally {chrome.tabs.captureVisibleTab=original;}
});

test('scroll positions are sampled after asynchronous scrolling settles', async () => {
  const original = window.scrollTo;
  window.scrollTo = function(position) { setTimeout(() => original.call(this, position), 20); };
  try {
    const result = await request('capture-full-page');
    assert.equal(result.success, true, result.error);
    assert.deepEqual(frames, [0, 800, 1100]);
  } finally { window.scrollTo = original; await new Promise(resolve => setTimeout(resolve, 30)); }
});

test('full-page capture detects the main inner scrolling panel', async () => {
  const query = document.querySelectorAll, computed = globalThis.getComputedStyle;
  const rootHeight = document.documentElement.scrollHeight;
  const bodyHeight = document.body.scrollHeight;
  let top = 75;
  const panel = { clientWidth:900,clientHeight:700,scrollHeight:2100,clientLeft:0,clientTop:0,
    getBoundingClientRect:()=>({left:50,top:50,width:900,height:700}),
    get scrollTop(){return top;},set scrollTop(value){top=Math.min(value,1400);} };
  document.documentElement.scrollHeight=document.body.scrollHeight=800;
  document.querySelectorAll=()=>[panel];
  globalThis.getComputedStyle=node=>node===panel?{overflowY:'auto',visibility:'visible',display:'block'}:computed(node);
  try {
    const result=await request('capture-full-page');
    assert.equal(result.success,true,result.error);
    assert.equal(metrics.totalHeight,2100);
    assert.equal(metrics.region.width,900);
    assert.deepEqual(frames,[0,700,1400]);
    assert.equal(top,75);
  } finally {document.querySelectorAll=query;globalThis.getComputedStyle=computed;document.documentElement.scrollHeight=rootHeight;document.body.scrollHeight=bodyHeight;}
});


test('background clipboard rejection retries in the captured document without a new tab', async () => {
  const send = chrome.runtime.sendMessage;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldFocus = document.hasFocus, oldItem = globalThis.ClipboardItem;
  let writes = 0;
  document.hasFocus = () => true;
  globalThis.ClipboardItem = class { constructor(data) { this.data=data; } };
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:async items=>{
    assert.equal(items[0].data['image/png'].type,'image/png'); writes++;
  }}}});
  chrome.runtime.sendMessage = async message => {
    if(message.target==='offscreen' && message.action==='finish') return {success:true,copied:false,resultAvailable:true,resultId:'ready',width:1000,height:800};
    if(message.target==='offscreen' && message.action==='clipboard-payload') {
      assert.equal(message.data.resultId,'ready'); return {success:true,base64:btoa('synthetic PNG')};
    }
    return send(message);
  };
  try {
    const result=await request('capture-full-page',{mode:'visible'});
    assert.equal(result.copied,true); assert.equal(writes,1);
    assert.equal((await request('capture-status')).copied,true);
    document.hasFocus=()=>false;
    assert.equal((await request('capture-full-page',{mode:'visible'})).copied,false);
    assert.equal(writes,1);
  } finally {
    chrome.runtime.sendMessage=send; document.hasFocus=oldFocus; globalThis.ClipboardItem=oldItem;
    if(previousNavigator) Object.defineProperty(globalThis,'navigator',previousNavigator); else delete globalThis.navigator;
  }
});
