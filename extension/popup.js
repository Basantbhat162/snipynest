const captureButton = document.getElementById('captureBtn');
const cancelButton = document.getElementById('cancelBtn');
const statusText = document.getElementById('status');
const progress = document.getElementById('progress');
let resultBlob;
let resultUrl;
let copying = false;
let resultId;
let activeTab;
let autoCopiedResult;

function render(status) {
  if (activeTab && status.tabId && (status.tabId !== activeTab.id || status.sourceUrl !== activeTab.url)) {
    status = status.busy ? {...status,message:'Capturing another tab. Return there to finish.'} : {phase:'idle',message:'Ready to capture this page.'};
  }
  captureButton.disabled = Boolean(status.busy);
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
  if (status.phase === 'error') void showResult().catch(()=>{});
  if (status.resultAvailable) void showResult().then(() => {
    if (!status.partial && status.copied === false && document.hasFocus() && autoCopiedResult !== resultId) {
      autoCopiedResult = resultId; return copyResult();
    }
  }).catch(error => { statusText.textContent = String(error); });
}

captureButton.addEventListener('click', async () => {
  render({ busy: true, phase: 'preparing', message: 'Preparing the page…' });
  document.getElementById('result').hidden = true;
  resultBlob = null; resultUrl = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = tab;
    const result = await chrome.runtime.sendMessage({ action: 'start-capture', tab, mode: document.getElementById('captureMode').value, slow: document.getElementById('slowCapture').checked });
    if (!result?.success) render({ phase: 'error', message: result?.error || 'Capture did not start.' });
  } catch (error) { render({ phase: 'error', message: String(error) }); }
});
async function showResult() {
  const result = await chrome.runtime.sendMessage({ action: 'result-preview' });
  if (!result?.success) throw new Error(result?.error || 'Capture an image first.');
  resultId = result.resultId;
  if (result.url !== resultUrl) {
    const response = await fetch(result.url);
    if (!response.ok) throw new Error('The image expired. Capture it again.');
    resultBlob = await response.blob(); resultUrl = result.url;
  }
  document.getElementById('preview').src = result.url;
  document.getElementById('saveResult').href = result.url;
  document.getElementById('result').hidden = false;
}
async function copyResult() {
  if (copying) return;
  copying = true;
  const button = document.getElementById('copyResult');
  button.disabled = true;
  try {
    // Invoke write during the user's click, in this focused extension document.
    // A promise-valued ClipboardItem preserves activation while fetching the PNG.
    const blob = resultBlob || showResult().then(() => resultBlob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    statusText.textContent = 'Copied to clipboard.';
    statusText.dataset.state = 'complete';
    void chrome.runtime.sendMessage({action:'copy-complete',resultId}).catch(()=>{});
  } catch (error) {
    statusText.dataset.state = 'error';
    statusText.textContent = `Copy failed. Keep this window active and try Copy image, or Save PNG. ${error.message || error}`;
  } finally { copying = false; button.disabled = false; }
}
document.getElementById('copyResult').addEventListener('click', copyResult);
cancelButton.addEventListener('click', async () => {
  cancelButton.disabled = true;
  try { await chrome.runtime.sendMessage({ action: 'cancel-capture' }); statusText.textContent = 'Cancelling and restoring the page…'; }
  catch { render({ phase: 'error', message: 'The capture service stopped. Reload this webpage and the extension.' }); }
});
chrome.runtime.onMessage.addListener(message => {
  if (message.target === 'popup' && message.action === 'capture-status') render(message.status);
});
void (async()=>{
  try {
    activeTab = (await chrome.tabs?.query({active:true,currentWindow:true}))?.[0];
    const settings = await chrome.runtime.sendMessage({action:'capture-settings'});
    if (['full','visible','feed','region'].includes(settings?.mode)) document.getElementById('captureMode').value=settings.mode;
    document.getElementById('slowCapture').checked=settings?.slow === true;
    render(await chrome.runtime.sendMessage({action:'capture-status'}));
  } catch {render({phase:'error',message:'Reload the extension to start the capture service.'});}
})();
// The service worker can restart while the offscreen result remains available.
void showResult().catch(() => {});
chrome.commands.getAll().then(commands => {
  const shortcut = commands.find(command => command.name === 'capture-full-page')?.shortcut;
  document.getElementById('shortcut').textContent = shortcut || 'No shortcut assigned';
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
