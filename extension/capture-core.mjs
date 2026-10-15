// Browser-independent capture seam; the adapter owns Chrome and document APIs.
export const CAPTURE_LIMITS = Object.freeze({ maxPixels: 32_000_000, maxDimension: 32_767, maxFrames: 50, intervalMs: 550 });

export function validateMetrics(metrics) {
  for (const field of ['viewportWidth', 'viewportHeight', 'totalHeight', 'devicePixelRatio']) {
    if (!Number.isFinite(metrics?.[field]) || metrics?.[field] <= 0) throw new Error('The page returned invalid dimensions. Reload it and try again.');
  }
  const width = Math.round(metrics.viewportWidth * metrics.devicePixelRatio);
  const height = Math.round(Math.max(metrics.totalHeight, metrics.viewportHeight) * metrics.devicePixelRatio);
  if (width > CAPTURE_LIMITS.maxDimension || height > CAPTURE_LIMITS.maxDimension || width * height > CAPTURE_LIMITS.maxPixels || Math.ceil(metrics.totalHeight / metrics.viewportHeight) > CAPTURE_LIMITS.maxFrames) {
    throw new Error('This page is too large to capture at full resolution. Zoom out or capture a smaller page.');
  }
}

export function createCaptureController(adapter) {
  let busy = false;
  let cancelled = false;
  let lastCaptureAt = -Infinity;
  let status = { phase: 'idle', message: 'Ready to capture.' };
  function update(next) {
    status = { ...next, busy };
    adapter.publish(status);
  }
  function checkCancelled() {
    if (cancelled) throw new Error('Capture cancelled.');
  }
  return {
    getStatus: () => ({ ...status, busy }),
    cancel: () => { if (busy && status.phase !== 'copying') cancelled = true; },
    async capture() {
      if (busy) return { success: false, error: 'A capture is already running. Wait or cancel it first.' };
      busy = true;
      cancelled = false;
      let tab;
      let prepared = false;
      let result;
      const startedAt = adapter.now();
      update({ phase: 'preparing', message: 'Preparing the page…' });
      try {
        tab = await adapter.getTab();
        if (!tab?.id) throw new Error('Open a webpage before capturing.');
        // Cleanup is also attempted when preparation fails after changing the page.
        prepared = true;
        const metrics = await adapter.prepare(tab);
        await adapter.assertActive(tab);
        validateMetrics(metrics);
        const totalHeight = Math.max(metrics.totalHeight, metrics.viewportHeight);
        await adapter.start({ ...metrics, totalHeight });
        let covered = 0;
        let frameCount = 0;
        while (covered < totalHeight) {
          checkCancelled();
          if(adapter.now()-startedAt>90_000) throw new Error("Capture timed out. Choose Visible area or a shorter section.");
          if (frameCount >= CAPTURE_LIMITS.maxFrames) throw new Error('The page did not finish scrolling. Try a smaller page.');
          const readPosition = async () => {
            const reply = await adapter.scroll(tab, covered, frameCount > 0);
            if (!reply || typeof reply !== 'object') throw new Error('The page did not respond while scrolling. Reload it and try again, or use Visible area.');
            return reply;
          };
          let position = await readPosition();
          for (let retry = 0; retry < 2 && position.y + metrics.viewportHeight <= covered; retry++) {
            checkCancelled();
            await adapter.sleep(250 * (retry + 1));
            position = await readPosition();
          }
          // Browsers can clamp the last offset to a fractional CSS pixel.
          const tolerance = 1 / Math.max(1, metrics.devicePixelRatio);
          if (Math.abs(position.y + metrics.viewportHeight - totalHeight) <= tolerance) {
            position = { ...position, y: Math.max(0, totalHeight - metrics.viewportHeight) };
          }
          if (position.viewportWidth !== metrics.viewportWidth || position.viewportHeight !== metrics.viewportHeight) throw new Error('The browser size changed during capture. Keep the window size unchanged and try again.');
          if (!Number.isFinite(position.y) || position.y < 0 || position.y > covered + 1 || position.y + metrics.viewportHeight <= covered) {
            if (covered > 0 && adapter.finishPartial) {
              const image = await adapter.finishPartial();
              result = {success:true,...image,partial:true,copied:false,capturesCount:frameCount,warning:'Partial capture: the page stopped moving. Save the captured section or choose a scrolling panel.'};
              break;
            }
            throw new Error('The page stopped scrolling before its reported end. Try Visible area, Loaded feed, or Choose scrolling panel.');
          }
          await adapter.sleep(Math.max(160, Math.min(1600, metrics.settleMs || 160)));
          const waitMs = CAPTURE_LIMITS.intervalMs - (adapter.now() - lastCaptureAt);
          if (waitMs > 0) await adapter.sleep(waitMs);
          checkCancelled();
          await adapter.assertActive(tab);
          lastCaptureAt = adapter.now();
          const dataUrl = await adapter.capture(tab);
          await adapter.assertActive(tab);
          checkCancelled();
          await adapter.append(metrics, { y: position.y, dataUrl });
          covered = Math.min(totalHeight, position.y + metrics.viewportHeight);
          frameCount += 1;
          update({ phase: 'capturing', progress: covered / totalHeight, message: `Capturing page · ${Math.round(covered / totalHeight * 100)}%` });
        }
        checkCancelled();
        update({ phase: 'copying', progress: 1, message: 'Writing PNG to clipboard…' });
        if (!result) {
          const image = await adapter.finish();
          result = { success: true, ...image, capturesCount: frameCount, scope:metrics.scope || 'Page' };
        }
      } catch (error) {
        result = { success: false, error: error instanceof Error ? error.message : String(error) };
      } finally {
        if (prepared) {
          try { await adapter.cleanup(tab); }
          catch { if (result?.success) result.warning = 'The image is ready, but the page could not be restored. Reload the page if needed.'; }
        }
        try { await adapter.release(); } catch { /* The document may have been closed already. */ }
        busy = false;
      }
      update(result.success
        ? { phase: 'complete', message: result.copied === false ? 'Image ready. Retry Copy or save PNG.' : `Copied ${result.width} × ${result.height} PNG.`, ...result }
        : { phase: cancelled ? 'cancelled' : 'error', message: result.error });
      return result;
    },
  };
}
