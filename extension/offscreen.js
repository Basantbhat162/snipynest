import { imageGeometry, frameRegion } from './stitch-plan.mjs';
import { screenshotPdf, PDF_CLIPBOARD_TYPE } from './screenshot-pdf.mjs';

const clipboardData = result => ({'image/png':result.blob, ...(result.pdf ? {[PDF_CLIPBOARD_TYPE]:new Blob([result.pdf], {type:PDF_CLIPBOARD_TYPE.slice(4)})} : {})});
const revokeResult = result => { URL.revokeObjectURL(result.url); if (result.pdfUrl) URL.revokeObjectURL(result.pdfUrl); };
async function base64Blob(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

let session;
let processing = false;
let completed;
let expiry;
async function process(action, data) {
  if (processing) throw new Error('Image processing is already in progress.');
  processing = true;
  try {
    if (action === 'result-preview') {
      if (!completed) throw new Error('The image expired. Capture it again.');
      return { url: completed.url, pdfUrl:completed.pdfUrl, width: completed.width, height: completed.height, resultId:completed.id,partial:completed.partial };
    }
    if (action === 'clipboard-payload') {
      if (!completed || completed.id !== data?.resultId || completed.partial) throw new Error('No complete capture available.');
      // Bound JSON/base64 transfer independently of the retained result budget.
      if (completed.blob.size + (completed.pdf?.size || 0) > 16 * 1024 * 1024) throw new Error('Use Copy in the popup for this large capture.');
      return {base64:await base64Blob(completed.blob), ...(completed.pdf ? {pdfBase64:await base64Blob(completed.pdf)} : {})};
    }
    if (action === 'retry-copy') {
      if (!completed) throw new Error('The image expired. Capture it again.');
      await navigator.clipboard.write([new ClipboardItem(clipboardData(completed))]);
      return { copied: true };
    }
    if (action === 'start') {
      if (session?.canvas) session.canvas.width=session.canvas.height=0;
      session = { metrics: data, canvas: null, geometry: null, covered: 0 };
      return {};
    }
    if (action === 'abort') {
      if (session?.canvas) session.canvas.width=session.canvas.height=0;
      session=null;
      return {resultAvailable:Boolean(completed)};
    }
    if (!session) throw new Error('The capture session expired. Try again.');
    if (action === 'append') {
      if (typeof data?.dataUrl !== 'string' || !data.dataUrl.startsWith('data:image/png;base64,') || data.dataUrl.length > 32_000_000) throw new Error('The captured frame is invalid or too large.');
      const blob = await (await fetch(data.dataUrl)).blob();
      let image = await createImageBitmap(blob);
      if(session.metrics.region){const r=session.metrics.region; const sx=image.width/r.windowWidth,sy=image.height/r.windowHeight;
        const full=image; try { image=await createImageBitmap(full,Math.round(r.x*sx),Math.round(r.y*sy),Math.round(r.width*sx),Math.round(r.height*sy)); } finally { full.close(); }
      }
      try {
        const geometry = imageGeometry(session.metrics, image);
        if (!session.canvas) {
          const canvas = document.createElement('canvas');
          canvas.width = geometry.width;
          canvas.height = geometry.height;
          session.canvas = canvas;
          session.geometry = geometry;
        } else if (geometry.width !== session.geometry.width || geometry.height !== session.geometry.height) throw new Error('The browser zoom changed during capture. Try again.');
        const region = frameRegion({ y: data.y, ...session.metrics, covered: session.covered, scale: geometry.scale });
        const context = session.canvas.getContext('2d');
        if (!context) throw new Error('The browser could not allocate image memory. Close some tabs and try again.');
        context.drawImage(image, 0, region.sourceY, image.width, region.height, 0, region.destinationY, image.width, region.height);
        session.covered = region.covered;
        return {};
      } finally { image.close(); }
    }
    if (action === 'finish') {
      const { canvas, geometry, metrics, covered } = session;
      const partial = data?.partial === true;
      if (!canvas || (!partial && covered < metrics.totalHeight)) throw new Error('The image is incomplete. Capture the page again.');
      let output = canvas;
      if (partial) {
        output=document.createElement('canvas');output.width=canvas.width;output.height=Math.round(covered*geometry.scale);
        if (!output.height) throw new Error('No image was captured.');
        output.getContext('2d').drawImage(canvas,0,0);
      }
      const blob = await new Promise((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error('The browser could not encode this PNG. Zoom out and try again.')), 'image/png'));
      // Some Chromium browsers require focus despite clipboardWrite permission.
      // Preserve the PNG so the popup or focused result tab can finish delivery.
      if (blob.size > 64 * 1024 * 1024) throw new Error('The completed PNG exceeds 64 MB. Capture a smaller area.');
      const pdf = metrics.outputFormat === 'pdf' && !partial ? await screenshotPdf(output) : null;
      if (blob.size + (pdf?.size || 0) > 64 * 1024 * 1024) throw new Error('The PNG and PDF together exceed 64 MB. Capture a shorter page.');
      const url = URL.createObjectURL(blob);
      clearTimeout(expiry);
      if (completed) revokeResult(completed);
      completed = { id:crypto.randomUUID(), partial, blob, url, pdf, pdfUrl:pdf ? URL.createObjectURL(pdf) : undefined, width: output.width, height: output.height };
      expiry = setTimeout(() => { if (completed) revokeResult(completed); completed = null; }, 5 * 60_000);
      expiry.unref?.();
      canvas.width = canvas.height = 0; output.width=output.height=0; session = null;
      let copied = false, warning;
      try { if (!partial) { await navigator.clipboard.write([new ClipboardItem(clipboardData(completed))]); copied = true; } }
      catch { warning = 'Capture ready, but clipboard access failed. Open the extension to retry Copy or save the file.'; }
      return { resultId:completed.id, partial, width: completed.width, height: completed.height, byteSize: blob.size, copied, warning, resultAvailable: true };
    }
    throw new Error('Unknown image processing request.');
  } finally { processing = false; }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'offscreen') return;
  process(message.action, message.data).then(result => respond({ success: true, ...result })).catch(error => respond({ success: false, error: error.message || String(error) }));
  return true;
});
