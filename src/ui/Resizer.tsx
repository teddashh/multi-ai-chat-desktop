import type { PointerEvent } from 'react';

export function Resizer({
  label,
  onDrag,
}: {
  label: string;
  onDrag: (deltaX: number, phase: 'start' | 'move' | 'end') => void;
}) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    document.body.style.cursor = 'col-resize';
    onDrag(0, 'start');

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      onDrag(moveEvent.clientX - startX, 'move');
    };
    const onPointerUp = (upEvent: globalThis.PointerEvent) => {
      onDrag(upEvent.clientX - startX, 'end');
      document.body.style.cursor = '';
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  return (
    <div
      aria-label={label}
      role="separator"
      aria-orientation="vertical"
      className="h-full cursor-col-resize bg-zinc-900 transition-colors hover:bg-sky-700"
      onPointerDown={onPointerDown}
    />
  );
}
