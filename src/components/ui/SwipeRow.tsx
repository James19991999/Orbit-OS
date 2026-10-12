'use client';
import { useRef, useState } from 'react';
import { cn } from './cn';
import { Icon } from './Icon';

interface Side { label: string; icon: string; tone: 'healthy' | 'alert' | 'primary'; run: () => void }
const BG = { healthy: 'bg-healthy text-white', alert: 'bg-alert text-white', primary: 'bg-primary-container text-on-primary-container' } as const;

/**
 * Touch-only swipe on a row: drag right (or left) past the line and let go to act. The row's own buttons stay for
 * mouse, keyboard and screen-reader users, so swiping is a shortcut, never the only way.
 */
export function SwipeRow({ right, left, children, className, disabled }: { right?: Side; left?: Side; children: React.ReactNode; className?: string; disabled?: boolean }) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; locked: 'x' | 'y' | null } | null>(null);
  const width = useRef(0);
  const passed = useRef(false);
  const dragged = useRef(false);
  const limit = () => Math.min(120, width.current * 0.35);

  const end = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const d = dx;
    setDx(0);
    passed.current = false;
    // Only the click the browser sends straight after this drag is swallowed; later taps work normally.
    if (dragged.current) setTimeout(() => { dragged.current = false; }, 80);
    if (d > limit() && right) right.run();
    else if (d < -limit() && left) left.run();
  };

  const side = dx > 0 ? right : dx < 0 ? left : undefined;
  const over = Math.abs(dx) > limit();
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {side && (
        <div aria-hidden className={cn('absolute inset-0 flex items-center px-4 text-label-md', BG[side.tone], dx > 0 ? 'justify-start' : 'justify-end', !over && 'opacity-70')}>
          <span className="flex items-center gap-2"><Icon name={side.icon} filled={over} />{side.label}</span>
        </div>
      )}
      <div
        className={cn('relative bg-surface-container-lowest', dx === 0 && 'transition-transform duration-200')}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          dragged.current = false;
          if (disabled || e.pointerType !== 'touch') return;
          width.current = e.currentTarget.getBoundingClientRect().width;
          start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: null };
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s || e.pointerId !== s.id) return;
          const mx = e.clientX - s.x; const my = e.clientY - s.y;
          if (!s.locked) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; s.locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'; }
          if (s.locked !== 'x') return;
          dragged.current = true;
          const v = Math.max(left ? -200 : 0, Math.min(right ? 200 : 0, mx));
          if (Math.abs(v) > limit() !== passed.current) { passed.current = !passed.current; if (passed.current) navigator.vibrate?.(10); }
          setDx(v);
        }}
        onPointerUp={end}
        // A drag must not also count as a tap on the link or button underneath.
        onClickCapture={(e) => { if (dragged.current) { e.preventDefault(); e.stopPropagation(); dragged.current = false; } }}
        onPointerCancel={() => { start.current = null; setDx(0); }}
      >
        {children}
      </div>
    </div>
  );
}
