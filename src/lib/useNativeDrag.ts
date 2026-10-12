import { useEffect, useRef } from "react";
import { createNativeDragGesture } from "./dragGesture";
/** Begin the native drag after a deliberate gesture, while the button is held. */
export function useNativeDrag(start: () => void) {
  const startRef = useRef(start);
  startRef.current = start;
  const gestureRef = useRef<ReturnType<typeof createNativeDragGesture> | null>(
    null,
  );
  if (!gestureRef.current)
    gestureRef.current = createNativeDragGesture(() => startRef.current());
  const gesture = gestureRef.current;
  useEffect(() => {
    window.addEventListener("blur", gesture.cancel);
    return () => {
      window.removeEventListener("blur", gesture.cancel);
      gesture.cancel();
    };
  }, [gesture]);
  return gesture.handlers;
}
