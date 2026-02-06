import { useState, useCallback, useRef } from "react";
import { MAP_WIDTH, MAP_HEIGHT } from "../lib/geo";

export interface MapState {
  x: number; // Camera offset X
  y: number; // Camera offset Y
  scale: number;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 5;

export function useMapState() {
  const [state, setState] = useState<MapState>({
    x: -MAP_WIDTH / 2 + 500,
    y: -MAP_HEIGHT / 2 + 300,
    scale: 1,
  });

  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setState((prev) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setState((prev) => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * delta));
      // Zoom toward cursor position
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const ratio = newScale / prev.scale;
      return {
        scale: newScale,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
  }, []);

  const panTo = useCallback(
    (pixelX: number, pixelY: number) => {
      setState((prev) => ({
        ...prev,
        x: -pixelX * prev.scale + window.innerWidth / 2,
        y: -pixelY * prev.scale + window.innerHeight / 2,
      }));
    },
    []
  );

  return {
    state,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onWheel,
    panTo,
    isDragging: dragging,
  };
}
