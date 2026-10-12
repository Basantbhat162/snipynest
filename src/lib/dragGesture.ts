interface CaptureTarget {
  setPointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
  releasePointerCapture(pointerId: number): void;
}
interface PointerInput {
  pointerId: number;
  button: number;
  buttons: number;
  clientX: number;
  clientY: number;
  currentTarget: CaptureTarget;
  stopPropagation(): void;
  preventDefault(): void;
}
/** Own one pointer until it cancels or crosses the native drag threshold. */
export function createNativeDragGesture(start: () => void) {
  let origin: {
    pointerId: number;
    x: number;
    y: number;
    target: CaptureTarget;
  } | null = null;
  function cancel() {
    const previous = origin;
    origin = null;
    if (!previous) return;
    try {
      if (previous.target.hasPointerCapture(previous.pointerId))
        previous.target.releasePointerCapture(previous.pointerId);
    } catch {
      /* The originating element may have been removed. */
    }
  }
  function end(event: Pick<PointerInput, "pointerId">) {
    if (origin?.pointerId === event.pointerId) cancel();
  }
  return {
    cancel,
    handlers: {
      onPointerDown(event: PointerInput) {
        if (origin || event.button !== 0 || !(event.buttons & 1)) return;
        event.stopPropagation();
        event.preventDefault();
        origin = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          target: event.currentTarget,
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          cancel();
        }
      },
      onPointerMove(event: PointerInput) {
        if (!origin || origin.pointerId !== event.pointerId) return;
        if (!(event.buttons & 1)) {
          cancel();
          return;
        }
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 6)
          return;
        // Clear ownership before releasing capture: lostpointercapture may fire here.
        cancel();
        start();
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
      onDragStart(event: { preventDefault(): void }) {
        event.preventDefault();
      },
    },
  };
}
