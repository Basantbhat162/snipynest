const captureButton = document.getElementById('captureBtn');
const cancelButton = document.getElementById('cancelBtn');
const statusText = document.getElementById('status');
const progress = document.getElementById('progress');
document.getElementById('extensionVersion').textContent = `Companion · ${chrome.runtime.getManifest?.().version || 'development'}`;
let loadedResult;
let resultRequest = 0;
let copying = false;
let activeTab;
let autoCopiedResult;
let pendingCapture = false;
let captureGeneration = 0;

function render(status) {
  if (activeTab && status.tabId && (status.tabId !== activeTab.id || status.sourceUrl !== activeTab.url)) {
    status = status.busy ? {...status,message:'Capturing another tab. Return there to finish.'} : {phase:'idle',message:'Ready to capture this page.'};
  }
  // Reopening a popup is not permission to overwrite newer clipboard content.
  const copyForThisCapture = pendingCapture && status.phase === 'complete';
  if (['complete', 'error', 'cancelled'].includes(status.phase)) pendingCapture = false;
  captureButton.disabled = Boolean(status.busy);
  for (const id of ['quickVisible','quickFull','quickPdf']) document.getElementById(id).disabled = Boolean(status.busy);
  captureButton.textContent = status.busy ? 'Capturing…' : status.phase === 'error' ? 'Try again' : 'Capture';
  cancelButton.hidden = !status.busy;
  cancelButton.disabled = status.phase === 'copying';
  progress.hidden = !status.busy;
  progress.value = status.progress || 0;
  statusText.textContent = status.warning || status.message || 'Ready to capture.';
  statusText.dataset.state = status.phase;
  document.getElementById('recovery').hidden = status.phase !== 'error' && !status.partial;
  // Live updates are atomic announcements; preserve the complete recovery message.
  statusText.setAttribute('aria-atomic', 'true');
  document.getElementById('captureMode').disabled = Boolean(status.busy);
  document.getElementById('captureFormat').disabled = Boolean(status.busy);
  if (status.phase === 'error') void showResult().catch(()=>{});
  if (status.resultAvailable) void showResult().then(loaded => {
    if (loaded && copyForThisCapture && !status.partial && status.copied === false && document.hasFocus() && autoCopiedResult !== loaded.resultId) {
      autoCopiedResult = loaded.resultId; return copyResult(loaded);
    }
  }).catch(error => { statusText.textContent = String(error); });
}

async function startCapture(mode, format, slow = false) {
  captureGeneration++;
  pendingCapture = true;
  render({ busy: true, phase: 'preparing', message: 'Preparing the page…' });
  document.getElementById('result').hidden = true;
  loadedResult = null; resultRequest++;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;
    const result = await chrome.runtime.sendMessage({ action: 'start-capture', tab, mode, format, slow });
    if (!result?.success) render({ phase: 'error', message: result?.error || 'Capture did not start.' });
  } catch (error) { render({ phase: 'error', message: String(error) }); }
}
captureButton.addEventListener('click', () => startCapture(document.getElementById('captureMode').value, document.getElementById('captureFormat').value, document.getElementById('slowCapture').checked));
for (const [id, mode, format] of [['quickVisible','visible','png'], ['quickFull','full','png'], ['quickPdf','full','pdf']]) document.getElementById(id).addEventListener('click', () => startCapture(mode,format));
document.getElementById('openSettings').addEventListener('click', () => chrome.runtime.openOptionsPage());
async function showResult() {
  const request = ++resultRequest;
  const generation = captureGeneration;
  const result = await chrome.runtime.sendMessage({ action: 'result-preview' });
  if (!result?.success) throw new Error(result?.error || 'Capture an image first.');
  let blob;
  if (loadedResult && loadedResult.resultId === result.resultId && loadedResult.url === result.url) {
    blob = loadedResult.blob;
  } else {
    const response = await fetch(result.url);
    if (!response.ok) throw new Error('The image expired. Capture it again.');
    blob = await response.blob();
  }
  if (request !== resultRequest || generation !== captureGeneration) return null;
  let pdf;
  if (result.pdfUrl) {
    const response = await fetch(result.pdfUrl);
    if (!response.ok) throw new Error('The PDF expired. Capture it again.');
    pdf = await response.blob();
  }
  if (request !== resultRequest || generation !== captureGeneration) return null;
  const loaded = {resultId:result.resultId,url:result.url,blob,pdf};
  loadedResult = loaded;
  document.getElementById('preview').src = loaded.url;
  document.getElementById('saveResult').href = loaded.url;
  document.getElementById('result').hidden = false;
  const savePdf = document.getElementById('savePdf');
  savePdf.hidden = !pdf; savePdf.href = result.pdfUrl || '';
  document.getElementById('resultFormat').textContent = pdf ? 'PDF + PNG' : 'PNG';
  document.getElementById('copyResult').textContent = pdf ? 'Copy PNG + PDF' : 'Copy image';
  return loaded;
}
async function copyResult(snapshot) {
  if (copying) return;
  copying = true;
  const button = document.getElementById('copyResult');
  button.disabled = true;
  let target = snapshot || loadedResult;
  try {
    // Keep write inside click activation; retain the copied result's own identity.
    const capture = target ? Promise.resolve(target) : showResult().then(loaded => {
      if (!loaded) throw new Error('The capture changed. Try Copy image again.');
      target = loaded;
      return loaded;
    });
    // All representations belong to one snapshot, even if a newer capture finishes.
    target = await capture;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': target.blob, ...(target.pdf ? {'web application/x-snipynest-capture-pdf':new Blob([target.pdf],{type:'application/x-snipynest-capture-pdf'})} : {}) })]);
    if (loadedResult?.resultId === target.resultId) {
      statusText.textContent = 'Copied to clipboard.';
      statusText.dataset.state = 'complete';
    }
    void chrome.runtime.sendMessage({action:'copy-complete',resultId:target.resultId}).catch(()=>{});
  } catch (error) {
    statusText.dataset.state = 'error';
    statusText.textContent = `Copy failed. Keep this window active and try Copy image, or Save PNG. ${error.message || error}`;
  } finally { copying = false; button.disabled = false; }
}
document.getElementById('copyResult').addEventListener('click', () => copyResult());
cancelButton.addEventListener('click', async () => {
  cancelButton.disabled = true;
  try { await chrome.runtime.sendMessage({ action: 'cancel-capture' }); statusText.textContent = 'Cancelling and restoring the page…'; }
  catch { render({ phase: 'error', message: 'The capture service stopped. Reload this webpage and the extension.' }); }
});
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message.target === 'popup' && message.action === 'capture-status') render(message.status);
  if (message.target !== 'popup' || message.action !== 'deliver-capture') return;
  if (!document.hasFocus()) { respond({accepted:false}); return; }
  respond({accepted:true});
  if (!copying && autoCopiedResult !== message.resultId) {
    autoCopiedResult = message.resultId;
    void showResult().then(loaded => { if (loaded?.resultId === message.resultId) return copyResult(loaded); }).catch(()=>{});
  }
});
void (async()=>{
  const generation = captureGeneration;
  try {
    activeTab = (await chrome.tabs?.query({active:true,currentWindow:true}))?.[0];
    const settings = await chrome.runtime.sendMessage({action:'capture-settings'});
    if (generation !== captureGeneration) return;
    if (['full','visible','feed','region'].includes(settings?.mode)) document.getElementById('captureMode').value=settings.mode;
    document.getElementById('captureFormat').value = settings?.format === 'pdf' ? 'pdf' : 'png';
    document.getElementById('slowCapture').checked=settings?.slow === true;
    const status = await chrome.runtime.sendMessage({action:'capture-status'});
    if (generation === captureGeneration) render(status);
  } catch {if (generation === captureGeneration) render({phase:'error',message:'Reload the extension to start the capture service.'});}
})();
// The service worker can restart while the offscreen result remains available.
void showResult().catch(() => {});
chrome.commands.getAll().then(commands => {
  const bindings = [['capture-full-page','Visible PNG','visibleShortcut'],['capture-long-page','Full PNG','fullShortcut'],['capture-full-page-pdf','Full PDF','pdfShortcut']];
  document.getElementById('shortcut').textContent = bindings.map(([name,label,id]) => {
    const shortcut = commands.find(command => command.name === name)?.shortcut || 'Unassigned';
    document.getElementById(id).textContent = shortcut;
    return `${label}: ${shortcut}`;
  }).join(' · ');
}).catch(() => {});
document.getElementById('shortcutsLink').addEventListener('click', event => {
  event.preventDefault();
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }).catch(() => {});
});

for (const [id,mode] of [['captureVisible','visible'],['capturePanel','region']]) {
  document.getElementById(id).addEventListener('click',()=>{document.getElementById('captureMode').value=mode;captureButton.click();});
}
document.getElementById('saveDiagnostics').addEventListener('click',async()=>{
  try {
    const report=await chrome.runtime.sendMessage({action:'diagnostics'});
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='SnipyNest-capture-diagnostics.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch {statusText.textContent='Could not save diagnostics. Reopen the extension and try again.';}
});
