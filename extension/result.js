const status = document.getElementById('status');
const button = document.getElementById('copy');
const automatic = new URLSearchParams(globalThis.location?.search || '').get('deliver');
let image, pdf, resultId;
let partial = false, busy = false, automaticAttempted = false;
const urls = [];
const retain = blob => { const url = URL.createObjectURL(blob); urls.push(url); return url; };
async function copy(auto = false) {
  if (!image || busy) return;
  busy = true; button.disabled = true;
  try {
    if (auto) {
      const claim = await chrome.runtime.sendMessage({action:'claim-delivery',resultId});
      if (!claim?.success || !document.hasFocus()) {
        status.textContent = 'Capture ready. Use Copy to copy this saved capture.';
        return;
      }
    }
    await navigator.clipboard.write([new ClipboardItem({'image/png':image, ...(pdf ? {'web application/x-snipynest-capture-pdf':new Blob([pdf],{type:'application/x-snipynest-capture-pdf'})} : {})})]);
    status.textContent = 'Copied to clipboard.'; status.dataset.state = 'complete';
    await chrome.runtime.sendMessage({action:'copy-complete',resultId});
    if (auto) setTimeout(()=>window.close(),350);
  } catch {
    status.textContent = 'Clipboard access was blocked. Keep this window active and click Copy, or save the capture.';
    status.dataset.state = 'error';
  } finally { busy = false; button.disabled = false; }
}
async function autoCopy() {
  if (!automatic || automaticAttempted || !image || partial || automatic !== resultId || !document.hasFocus()) return;
  automaticAttempted = true;
  await copy(true);
}
button.addEventListener('click',()=>copy());
window.addEventListener('focus',()=>void autoCopy());
try {
  const result = await chrome.runtime.sendMessage({action:'result-preview'});
  if (!result?.success) throw new Error(result?.error || 'No capture available.');
  resultId = result.resultId; partial = result.partial === true;
  const load = async url => { const response = await fetch(url); if (!response.ok) throw new Error('The capture expired. Take another screenshot.'); return response.blob(); };
  image = await load(result.url);
  if (result.pdfUrl) pdf = await load(result.pdfUrl);
  const url = retain(image);
  const preview = document.getElementById('image'); preview.src = url; preview.hidden = false;
  const save = document.getElementById('save'); save.href = url; save.hidden = false;
  const savePdf = document.getElementById('savePdf');
  if (pdf) {savePdf.href = retain(pdf); savePdf.hidden = false; button.textContent = 'Copy PNG + PDF';}
  button.disabled = false;
  status.textContent = partial ? 'Partial capture. Only the captured section is available.' : automatic ? 'Copying your capture…' : 'Capture ready. Copy it or save the file.';
  await autoCopy();
} catch (error) { status.textContent = error.message || String(error); status.dataset.state = 'error'; }
window.addEventListener('pagehide',()=>urls.forEach(url=>URL.revokeObjectURL(url)));
