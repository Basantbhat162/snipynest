import { CAPTURE_LIMITS } from './capture-core.mjs';

export function imageGeometry(metrics, image) {
  const scale = image.width / metrics.viewportWidth;
  if (!Number.isFinite(scale) || scale <= 0 || Math.abs(image.height - metrics.viewportHeight * scale) > 2) throw new Error('Screenshot dimensions changed. Keep the browser size and zoom unchanged.');
  const height = Math.round(metrics.totalHeight * scale);
  if (image.width > CAPTURE_LIMITS.maxDimension || height > CAPTURE_LIMITS.maxDimension || image.width * height > CAPTURE_LIMITS.maxPixels) throw new Error('This page is too large at the captured resolution. Zoom out and try again.');
  return { width: image.width, height, scale };
}

export function frameRegion({ y, viewportHeight, totalHeight, covered, scale }) {
  if (!Number.isFinite(y) || y < 0 || y > covered + 1) throw new Error('A gap appeared while scrolling. Try capturing the page again.');
  const end = Math.min(totalHeight, y + viewportHeight);
  if (end <= covered) throw new Error('The page stopped scrolling before the capture finished.');
  const destinationY = Math.round(covered * scale);
  const sourceY = destinationY - Math.round(y * scale);
  return { sourceY, destinationY, height: Math.round(end * scale) - destinationY, covered: end };
}
