// Serialized by chrome.scripting: keep this function self-contained in the isolated world.
export async function copyInCapturedPage(token, base64) {
  if (window.__omnicopyCapture?.token !== token || !document.hasFocus()) return false;
  if (typeof base64 !== 'string' || base64.length > 24 * 1024 * 1024) return false;
  const decoded = atob(base64);
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  const image = new Blob([bytes], {type:'image/png'});
  if (window.__omnicopyCapture?.token !== token || !document.hasFocus()) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({'image/png': image})]);
    return true;
  } catch { return false; }
}
