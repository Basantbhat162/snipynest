const status = document.getElementById('status');
const button = document.getElementById('copy');
let image;
let url;
let busy = false;
let resultId;
let partial = false;
async function copy() {
  if (!image || busy) return;
  busy = true; button.disabled = true;
  try {
    await navigator.clipboard.write([new ClipboardItem({'image/png': image})]);
    status.textContent = 'Copied to clipboard.'; status.dataset.state = 'complete';
    void chrome.runtime.sendMessage({action:'copy-complete',resultId}).catch(()=>{});
  } catch {
    status.textContent = 'Image saved here. Click Copy image while this tab is active, or Save PNG.';
    status.dataset.state = 'error';
  } finally { busy = false; button.disabled = false; }
}
button.addEventListener('click', copy);
try {
  const result = await chrome.runtime.sendMessage({action:'result-preview'});
  if (!result?.success) throw new Error(result?.error || 'No capture available.');
  resultId = result.resultId;
  partial = result.partial === true;
  const response = await fetch(result.url);
  if (!response.ok) throw new Error('The capture expired. Take another screenshot.');
  image = await response.blob();
  url = URL.createObjectURL(image);
  const preview = document.getElementById('image');
  preview.src = url; preview.hidden = false;
  const save = document.getElementById('save');
  save.href = url; save.hidden = false;
  button.disabled = false;
  status.textContent = partial ? 'Partial capture: only the captured section is available. Copy or save it, or capture a scrolling panel.' : 'Image ready. Copy it or save the PNG.';
} catch (error) { status.textContent = error.message || String(error); status.dataset.state = 'error'; }
window.addEventListener('pagehide', () => { if (url) URL.revokeObjectURL(url); });
