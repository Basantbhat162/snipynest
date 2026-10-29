import { createCaptureController } from './capture-core.mjs';
import { copyInCapturedPage } from './clipboard-delivery.mjs';
import { createDesktopControl } from './desktop-control.mjs';

let creatingOffscreen;
let sessionId;
let requestTab;
let captureMode = "full";
let outputFormat = 'png';
let keepResult = false;
let settleMs = 500;
let starting = false;
let lastStatus = {phase:'idle',message:'Ready to capture.'};
let deliveryCopied = false;
let resultIdentity;
let pendingDelivery;
let captureRevision = 0;
const diagnostics = [];
function trace(event) {
  diagnostics.push({at:Date.now(),...event});
  if (diagnostics.length > 100) diagnostics.shift();
}
async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('offscreen.html')] });
  if (existing.length) return;
  if (!creatingOffscreen) creatingOffscreen = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['CLIPBOARD', 'BLOBS'], justification: 'Compose a full-page PNG and write it to the system clipboard.' }).finally(() => { creatingOffscreen = null; });
  await creatingOffscreen;
}

async function inject(tab, func, args = []) {
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  if (!results[0]) throw new Error('Could not access this page. Reload it and try again.');
  const result = results[0].result;
  if (result?.__captureError) throw new Error(result.__captureError);
  return result;
}

async function offscreen(action, data) {
  let timeout;
  let response;
  try {
    response = await Promise.race([
      chrome.runtime.sendMessage({ target: 'offscreen', action, data }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Image processing timed out. Zoom out or close some tabs and try again.')), 20_000); }),
    ]);
  } finally { clearTimeout(timeout); }
  if (!response?.success) throw new Error(response?.error || 'The image processor did not respond. Reload the extension and try again.');
  return response;
}

const controller = createCaptureController({
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  getTab: async () => {
    const tab = requestTab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    if (!tab || !/^(https?:|file:)/i.test(tab.url || '')) throw new Error('Open a normal webpage. Browser settings, the extension store, and PDF viewers cannot be captured.');
    keepResult = false;
    sessionId = crypto.randomUUID();
    requestTab = tab;
    trace({stage:'start',session:sessionId});
    return tab;
  },
  prepare: async tab => inject(tab, async (token, mode, settleMs) => {
    // Return failures as data: Chrome does not reliably propagate injected exceptions.
    try {
    // The worker serializes captures; an old page token can survive its restart.
    window.__omnicopyCapture?.restore?.();
    if (window.__omnicopyCapture) throw new Error('A previous capture is still restoring this page. Reload it and try again.');
    const style = document.createElement('style');
    style.textContent = 'html,body,* {scroll-behavior:auto!important;scroll-snap-type:none!important;overflow-anchor:none!important} *,*::before,*::after{caret-color:transparent!important}';
    const state = { token, mode, region: null, regionY: 0, x: window.scrollX, y: window.scrollY, style, hidden: new Map() };
    window.__omnicopyCapture = state;
    state.restore = () => {
      if (window.__omnicopyCapture !== state) return;
      clearTimeout(state.watchdog);
      for (const [node, original] of state.hidden) {
        if (original.value) node.style.setProperty('visibility',original.value,original.priority);
        else node.style.removeProperty('visibility');
      }
      state.cancelSelection?.();
      if (state.region) state.region.scrollTop=state.regionY;
      window.scrollTo({left:state.x,top:state.y,behavior:'instant'});
      state.style.remove();delete window.__omnicopyCapture;
    };
    state.watchdog=setTimeout(state.restore,180000);
    state.watchdog.unref?.();
    (document.head || document.documentElement).append(style);
    if (mode === 'region') {
      const hint=document.createElement('div');
      hint.textContent='Click inside the scrolling panel to capture. Escape cancels.';
      hint.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#182333;color:white;padding:12px;border-radius:8px;font:14px sans-serif;pointer-events:none';
      document.documentElement.append(hint);
      state.region=await new Promise((resolve,reject)=>{
        const finish=(node,error)=>{clearTimeout(timer);hint.remove();document.removeEventListener('click',choose,true);document.removeEventListener('keydown',key,true);state.cancelSelection=null;error?reject(new Error(error)):resolve(node);};
        const choose=e=>{let node=e.target;while(node && node!==document.body){const css=getComputedStyle(node);if(node.scrollHeight>node.clientHeight+4 && /auto|scroll/.test(css.overflowY))break;node=node.parentElement;} e.preventDefault();e.stopPropagation(); if(!node || node===document.body){hint.textContent='Choose a panel with its own vertical scrollbar, or Escape to cancel.';return;}finish(node);};
        const key=e=>{if(e.key==='Escape')finish(null,'Panel selection cancelled.');};
        const timer=setTimeout(()=>finish(null,'Panel selection timed out.'),30000);
        state.cancelSelection=()=>finish(null,'Panel selection cancelled.');
        document.addEventListener('click',choose,true);document.addEventListener('keydown',key,true);
      });
      state.regionY=state.region.scrollTop;
    }
    const root = document.documentElement;
    const body = document.body;
    if (!state.region && (mode === 'full' || mode === 'feed')) {
      const rootExtent = document.scrollingElement?.scrollHeight ?? Math.max(root.scrollHeight, body?.scrollHeight || 0);
      const candidates = [];
      for (const node of document.querySelectorAll('body *')) {
        if (!(node.scrollHeight > node.clientHeight + 4)) continue;
        const css = getComputedStyle(node);
        if (!/auto|scroll/.test(css.overflowY) || css.visibility === 'hidden' || css.display === 'none') continue;
        const bounds = node.getBoundingClientRect();
        const x = bounds.left + node.clientLeft, y = bounds.top + node.clientTop;
        const area = node.clientWidth * node.clientHeight;
        if (x < 0 || y < 0 || x + node.clientWidth > window.innerWidth + 1 || y + node.clientHeight > window.innerHeight + 1) continue;
        if (area < window.innerWidth * window.innerHeight * 0.3) continue;
        candidates.push({node, area});
      }
      candidates.sort((a,b) => b.area-a.area);
      if (candidates.length && (rootExtent <= window.innerHeight + 4 || candidates[0].area > window.innerWidth * window.innerHeight * 0.65)) {
        if (candidates[1] && candidates[1].area > candidates[0].area * 0.85) throw new Error('This page has several scrolling panels. Choose scrolling panel to select the content.');
        state.region = candidates[0].node;
        state.regionY = state.region.scrollTop;
      }
    }
    if(state.region){const bounds=state.region.getBoundingClientRect();
      const x=bounds.left+state.region.clientLeft,y=bounds.top+state.region.clientTop;
      const width=state.region.clientWidth,height=state.region.clientHeight;
      if(x<0 || y<0 || x+width>window.innerWidth || y+height>window.innerHeight) throw new Error('Keep the entire selected panel visible before capturing.');
      state.regionBounds={x,y,width,height};
      return {settleMs,scope:'Scrolling panel',viewportWidth:width,viewportHeight:height,totalHeight:mode === 'feed' ? Math.min(state.region.scrollHeight,height*5) : state.region.scrollHeight,devicePixelRatio:window.devicePixelRatio||1,region:{x,y,width,height,windowWidth:window.innerWidth,windowHeight:window.innerHeight}};
    }
    const scrollHeight = document.scrollingElement?.scrollHeight ?? Math.max(root.scrollHeight, body?.scrollHeight || 0);
    return { settleMs, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, totalHeight: mode === 'visible' ? window.innerHeight : mode === 'feed' ? Math.min(window.innerHeight*5,Math.max(scrollHeight,window.innerHeight)) : Math.max(window.innerHeight,scrollHeight), devicePixelRatio: window.devicePixelRatio || 1 };
    } catch (error) {
      return {__captureError: error instanceof Error ? error.message : 'The page could not complete this capture step.'};
    }
  }, [sessionId, captureMode, settleMs]),
  scroll: async (tab, y, hidePinned) => inject(tab, async (token, targetY, hide) => {
    // Return failures as data: Chrome does not reliably propagate injected exceptions.
    try {
    const state = window.__omnicopyCapture;
    if (state?.token !== token) throw new Error('The page navigated during capture. Try again on the loaded page.');
    const settle = async () => {
      let previous = NaN, stable = 0;
      for (let sample = 0; sample < 12; sample++) {
        await new Promise(resolve => setTimeout(resolve, 40));
        const actual = state.region ? state.region.scrollTop : window.scrollY;
        stable = Math.abs(actual - previous) < 0.1 ? stable + 1 : 0;
        previous = actual;
        if (stable >= 2) return;
      }
      throw new Error('The page keeps moving. Stop scrolling and try again.');
    };
    state.expectedWindow={width:window.innerWidth,height:window.innerHeight,x:window.scrollX,y:window.scrollY};
    if (state.region) {
      state.region.scrollTop=targetY;
      await settle();
      state.expectedRegionY=state.region.scrollTop;
      const bounds=state.region.getBoundingClientRect();
      if(Math.abs(bounds.left+state.region.clientLeft-state.regionBounds.x)>1 || Math.abs(bounds.top+state.region.clientTop-state.regionBounds.y)>1 || state.region.clientWidth!==state.regionBounds.width || state.region.clientHeight!==state.regionBounds.height) throw new Error('The selected panel moved or resized. Try again.');
    } else {
      if (state.mode !== 'visible') window.scrollTo({ left: 0, top: targetY, behavior: 'instant' });
      await settle();
      state.expectedWindow={width:window.innerWidth,height:window.innerHeight,x:window.scrollX,y:window.scrollY};
    }
    const captureBounds=state.regionBounds || {x:0,y:0,width:window.innerWidth,height:window.innerHeight};
    // Keep pinned content once in the first viewport, then prevent repeated headers.
    if (hide && state.mode !== 'visible') for (const node of document.querySelectorAll('body *')) {
      if (state.hidden.has(node) || (state.region && !state.region.contains?.(node))) continue;
      const computed = getComputedStyle(node);
      const position = computed.position;
      if (position !== 'fixed' && position !== 'sticky') continue;
      // Large pinned scenes/canvases are page content, not repeated navigation.
      const scene = node.getBoundingClientRect();
      if (scene.width * scene.height > captureBounds.width * captureBounds.height * 0.35 || node.tagName === 'CANVAS' || node.tagName === 'VIDEO') continue;
      if (position === 'sticky') {
        const bounds = node.getBoundingClientRect();
        const insetTop = Number.parseFloat(computed.top);
        const insetBottom = Number.parseFloat(computed.bottom);
        const pinnedTop = Number.isFinite(insetTop) && Math.abs(bounds.top - (captureBounds.y + insetTop)) < 2;
        const pinnedBottom = Number.isFinite(insetBottom) && Math.abs(bounds.bottom - (captureBounds.y + captureBounds.height - insetBottom)) < 2;
        if (!pinnedTop && !pinnedBottom) continue;
      }
      state.hidden.set(node, { value: node.style.getPropertyValue('visibility'), priority: node.style.getPropertyPriority('visibility') });
      node.style.setProperty('visibility', 'hidden', 'important');
    }
    if (state.region) return {y:state.region.scrollTop,viewportWidth:state.region.clientWidth,viewportHeight:state.region.clientHeight};
    return { y: state.mode === 'visible' ? 0 : window.scrollY, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };
    } catch (error) {
      return {__captureError: error instanceof Error ? error.message : 'The page could not complete this capture step.'};
    }
  }, [sessionId, y, hidePinned]),
  assertActive: async tab => {
    const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    const windowState = await chrome.windows.get(tab.windowId);
    if (active?.id !== tab.id) throw new Error('The active tab changed. Return to the original tab and try again.');
    if (windowState.state === 'minimized') throw new Error('Restore the browser window before capturing.');
    const sameDocument = await inject(tab, token => {
    // Return failures as data: Chrome does not reliably propagate injected exceptions.
    try {
      const state=window.__omnicopyCapture;
      if(state?.token!==token)return false;
      const expected=state.expectedWindow;
      if(expected && (window.innerWidth!==expected.width || window.innerHeight!==expected.height || Math.abs(window.scrollX-expected.x)>1 || Math.abs(window.scrollY-expected.y)>1))throw new Error('The page scrolled or resized during capture. Keep the page still and try again.');
      if(state.region && expected){
        const bounds=state.region.getBoundingClientRect(),r=state.regionBounds;
        if(Math.abs(state.region.scrollTop-state.expectedRegionY)>1 || Math.abs(bounds.left+state.region.clientLeft-r.x)>1 || Math.abs(bounds.top+state.region.clientTop-r.y)>1 || state.region.clientWidth!==r.width || state.region.clientHeight!==r.height)throw new Error('The selected panel moved or scrolled during capture. Try again.');
      }
      return true;
    } catch (error) {
      return {__captureError: error instanceof Error ? error.message : 'The page could not complete this capture step.'};
    }
    }, [sessionId]);
    if (!sameDocument) throw new Error('The page navigated or reloaded during capture. Try again on the loaded page.');
  },
  capture: tab => chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }),
  start: async metrics => { await ensureOffscreen(); await offscreen('start', {...metrics,outputFormat}); },
  append: (_, frame) => { trace({stage:'frame',y:frame.y}); return offscreen('append', frame); },
  finish: async () => {
    const result = await offscreen('finish');
    keepResult = Boolean(result.resultAvailable); resultIdentity = result.resultId;
    if (result.copied === false && !result.partial) {
      // Try the still-focused captured document without opening a tab or stealing focus.
      // A document token prevents writing a prior capture after navigation.
      try {
        const payload = await offscreen('clipboard-payload', {resultId: result.resultId});
        const copied = await inject(requestTab, copyInCapturedPage, [sessionId, payload.base64, payload.pdfBase64]);
        if (copied === true) { result.copied = true; delete result.warning; }
      } catch { trace({stage:'clipboard-pending'}); }
    }
    deliveryCopied = result.copied === true;
    return result;
  },
  finishPartial: async () => { const result = await offscreen('finish',{partial:true}); keepResult = Boolean(result.resultAvailable); resultIdentity=result.resultId; return result; },
  cleanup: async tab => inject(tab, token => {
    const state = window.__omnicopyCapture;
    if (state?.token !== token) return;
    state.restore();
  }, [sessionId]),
  release: async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [chrome.runtime.getURL('offscreen.html')] });
    if (contexts.length) {
      try { keepResult=Boolean((await offscreen('abort')).resultAvailable) || keepResult; } catch {}
      if (!keepResult) await chrome.offscreen.closeDocument();
    }
  },
  publish: status => {
    status = {...status,tabId:requestTab?.id,sourceUrl:requestTab?.url,sessionId,copied:deliveryCopied || status.copied};
    lastStatus = status;
    trace({stage:status.phase,message:status.phase === 'error' ? status.message : undefined});
    chrome.runtime.sendMessage({ target: 'popup', action: 'capture-status', status }).catch(() => {});
    const label = status.busy ? `${Math.round((status.progress || 0) * 100)}` : status.phase === 'error' ? '!' : status.resultAvailable && status.copied === false ? 'PNG' : '';
    chrome.action.setBadgeText({ text: label }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: status.phase === 'error' ? '#b84040' : '#3d6edb' }).catch(() => {});
    chrome.action.setTitle({ title: status.message }).catch(() => {});
  },
});

async function beginCapture(tab, mode = 'full', slow = false, format = 'png', saveSettings = true) {
  if (starting || controller.getStatus().busy) return Promise.resolve({ success: false, error: 'A capture is already running.' });
  starting = true;
  const revision = ++captureRevision;
  pendingDelivery = null;
  requestTab = tab; captureMode = mode; outputFormat = format; settleMs = slow ? 1400 : mode === 'visible' ? 0 : 500; deliveryCopied=false;
  if (saveSettings) try { await chrome.storage?.local?.set({captureSettings:{mode,slow,format}}); } catch {}
  let result;
  try { result = await controller.capture(); } finally { starting = false; }
  const completedId = resultIdentity, sourceTab = requestTab;
  if (result?.success && result.copied === false && result.resultAvailable && !result.partial && resultIdentity) {
    try {
      // An offscreen document cannot take focus. Complete delivery in an extension
      // window only while the user is still on the captured tab.
      const popup = await chrome.runtime.sendMessage({target:'popup',action:'deliver-capture',resultId:completedId}).catch(()=>null);
      if (!popup?.accepted && revision === captureRevision && !deliveryCopied) {
        const [active] = await chrome.tabs.query({active:true,windowId:sourceTab.windowId});
        const source = await chrome.windows.get(sourceTab.windowId);
        if (revision === captureRevision && !deliveryCopied && source.focused && active?.id === sourceTab.id) {
          pendingDelivery = {resultId:completedId,expires:Date.now()+30_000};
          await chrome.windows.create({type:'popup',focused:true,width:440,height:400,url:chrome.runtime.getURL(`result.html?deliver=${encodeURIComponent(completedId)}`)});
        }
      }
    } catch { trace({stage:'delivery-window-unavailable'}); }
  }
  return result;
}
chrome.commands.onCommand.addListener((command, tab) => {
  // Preserve the old command ID so an installed Alt+Shift+S binding becomes a
  // visible snapshot on update; scrolling capture has its own new command.
  if (!['capture-full-page','capture-long-page','capture-full-page-pdf'].includes(command)) return;
  void (async()=>{
    let settings;
    try { settings = (await chrome.storage?.local?.get('captureSettings'))?.captureSettings; } catch {}
    await beginCapture(tab, command === 'capture-full-page' ? 'visible' : 'full', command !== 'capture-full-page' && settings?.slow === true, command === 'capture-full-page-pdf' ? 'pdf' : 'png', false);
  })();
});
chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (sender.id !== chrome.runtime.id || request.target === 'offscreen' || request.target === 'popup') return;
  if (request.action==='desktop-control-status'){respond(desktopControl.status());return;}
  if (request.action==='desktop-control-set'){desktopControl.setEnabled(request.enabled).then(respond).catch(error=>respond({connected:false,message:error.message}));return true;}
  if (request.action === 'capture-status') { respond({...lastStatus,busy:starting || controller.getStatus().busy}); return; }
  if (request.action === 'capture-settings') {
    (async()=>{try {return (await chrome.storage?.local?.get('captureSettings'))?.captureSettings || {};} catch {return {};}})().then(respond);return true;
  }
  if (request.action === 'diagnostics') { respond({version:chrome.runtime.getManifest?.().version,events:diagnostics});return; }
  if (request.action === 'copy-complete') {
    if (!request.resultId || request.resultId !== resultIdentity) {respond({success:false});return;}
    deliveryCopied=true;lastStatus={...lastStatus,copied:true,message:'Copied to clipboard.'};delete lastStatus.warning;
    pendingDelivery=null;
    chrome.action.setTitle({title:lastStatus.message}).catch(()=>{});
    chrome.runtime.sendMessage({target:'popup',action:'capture-status',status:lastStatus}).catch(()=>{});
    chrome.action.setBadgeText({text:''}).catch(()=>{});respond({success:true});return;
  }
  if (request.action === 'claim-delivery') {
    const allowed = !starting && !controller.getStatus().busy && pendingDelivery?.resultId === request.resultId && request.resultId === resultIdentity && pendingDelivery.expires > Date.now();
    if (allowed) pendingDelivery=null;
    respond({success:Boolean(allowed)});return;
  }
  if (request.action === 'cancel-capture') { controller.cancel(); if(requestTab)void inject(requestTab,()=>window.__omnicopyCapture?.cancelSelection?.()).catch(()=>{}); respond({ success: true }); return; }
  if (request.action === 'capture-full-page') { beginCapture(request.tab, ['visible','feed','region'].includes(request.mode) ? request.mode : 'full', request.slow === true, request.format === 'pdf' ? 'pdf' : 'png').then(respond); return true; }
  if (request.action === 'start-capture') {
    if (starting || controller.getStatus().busy) { respond({ success: false, error: 'A capture is already running.' }); return; }
    void beginCapture(request.tab, ['visible','feed','region'].includes(request.mode) ? request.mode : 'full', request.slow === true, request.format === 'pdf' ? 'pdf' : 'png');
    respond({ success: true }); return;
  }
  if (request.action === 'result-preview' || request.action === 'retry-copy') {
    offscreen(request.action).then(respond).catch(error => respond({ success: false, error: error.message })); return true;
  }
});
const desktopControl=createDesktopControl(chrome,beginCapture,()=>starting||controller.getStatus().busy);
void desktopControl.restore().catch(()=>{});
