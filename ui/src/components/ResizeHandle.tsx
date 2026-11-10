import type { KeyboardEvent, PointerEvent } from 'react';

export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 248;
const STEP = 16;

export function clampWidth(width: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(width)));
}

interface Props {
  width: number;
  /** Called while dragging; `done` is true when the drag or key press ends. */
  onResize: (width: number, done: boolean) => void;
}

/** The bar between the sidebar and the main area. Double-click resets it. */
export function ResizeHandle({ width, onResize }: Props) {
  const start = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture?.(event.pointerId);
    const from = event.clientX;
    const initial = width;
    const move = (moved: globalThis.PointerEvent) => onResize(clampWidth(initial + moved.clientX - from), false);
    const end = (ended: globalThis.PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      onResize(clampWidth(initial + ended.clientX - from), true);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowLeft' ? -STEP : event.key === 'ArrowRight' ? STEP : 0;
    if (event.key === 'Home') onResize(SIDEBAR_MIN, true);
    else if (event.key === 'End') onResize(SIDEBAR_MAX, true);
    else if (delta) onResize(clampWidth(width + delta), true);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className="resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={start}
      onKeyDown={keys}
      onDoubleClick={() => onResize(SIDEBAR_DEFAULT, true)}
    />
  );
}
