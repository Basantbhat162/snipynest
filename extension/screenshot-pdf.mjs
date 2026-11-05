// Raster PDF: page-sized JPEG strips keep encoding memory bounded. No remote service.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
export const PDF_CLIPBOARD_TYPE = 'web application/x-snipynest-capture-pdf';
export const MAX_PDF_BYTES = 32 * 1024 * 1024;

export function assemblePdf(pages) {
  if (!pages.length || pages.length > 100) throw new Error('PDF requires between 1 and 100 pages.');
  const parts = [], offsets = [0];
  let length = 0;
  const add = value => { const part = typeof value === 'string' ? new TextEncoder().encode(value) : value; parts.push(part); length += part.byteLength; };
  const object = (id, body) => { offsets[id] = length; add(`${id} 0 obj\n${body}\nendobj\n`); };
  add('%PDF-1.4\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 3} 0 R`).join(' ')}] >>`);
  pages.forEach((page, index) => {
    const id = 3 + index * 3;
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    offsets[id + 1] = length;
    add(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.byteLength} >>\nstream\n`);
    add(page.bytes); add('\nendstream\nendobj\n');
    const height = Math.min(PAGE_HEIGHT, PAGE_WIDTH * page.height / page.width);
    const content = `q\n${PAGE_WIDTH} 0 0 ${height.toFixed(4)} 0 ${(PAGE_HEIGHT - height).toFixed(4)} cm\n/Im0 Do\nQ\n`;
    object(id + 2, `<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}endstream`);
  });
  const xref = length;
  add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) add(`${String(offset).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  if (length > MAX_PDF_BYTES) throw new Error('The PDF exceeds 32 MB. Capture a shorter page.');
  return new Blob(parts, {type:'application/pdf'});
}

export async function screenshotPdf(canvas) {
  const rows = Math.max(1, Math.floor(canvas.width * PAGE_HEIGHT / PAGE_WIDTH));
  if (!canvas.width || !canvas.height || Math.ceil(canvas.height / rows) > 100) throw new Error('The PDF exceeds 100 pages. Capture a shorter page.');
  const strip = document.createElement('canvas');
  const pages = [];
  let size = 0;
  try {
    for (let y = 0; y < canvas.height; y += rows) {
      strip.width = canvas.width; strip.height = Math.min(rows, canvas.height - y);
      const context = strip.getContext('2d');
      if (!context) throw new Error('PDF image memory is unavailable.');
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, strip.width, strip.height);
      context.drawImage(canvas, 0, y, strip.width, strip.height, 0, 0, strip.width, strip.height);
      const jpeg = await new Promise((resolve, reject) => strip.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not encode the PDF page.')), 'image/jpeg', 0.95));
      if (jpeg.type !== 'image/jpeg') throw new Error('This browser cannot encode PDF images.');
      size += jpeg.size;
      if (size > MAX_PDF_BYTES) throw new Error('The PDF exceeds 32 MB. Capture a shorter page.');
      pages.push({width:strip.width, height:strip.height, bytes:new Uint8Array(await jpeg.arrayBuffer())});
    }
    return assemblePdf(pages);
  } finally { strip.width = strip.height = 0; }
}
