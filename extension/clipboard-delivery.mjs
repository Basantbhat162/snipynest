// Serialized by chrome.scripting: keep this function self-contained in the isolated world.
export async function copyInCapturedPage(token, base64, pdfBase64) {
  if (window.__omnicopyCapture?.token !== token || !document.hasFocus()) return false;
  if (typeof base64 !== 'string' || base64.length > 24 * 1024 * 1024) return false;
  const decoded = atob(base64);
  const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
  const image = new Blob([bytes], {type:'image/png'});
  if (pdfBase64 != null && (typeof pdfBase64 !== 'string' || base64.length + pdfBase64.length > 24 * 1024 * 1024)) return false;
  const data = {'image/png':image};
  if (pdfBase64) data['web application/x-snipynest-capture-pdf'] = new Blob([Uint8Array.from(atob(pdfBase64), char => char.charCodeAt(0))], {type:'application/x-snipynest-capture-pdf'});
  if (window.__omnicopyCapture?.token !== token || !document.hasFocus()) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem(data)]);
    return true;
  } catch { return false; }
}
