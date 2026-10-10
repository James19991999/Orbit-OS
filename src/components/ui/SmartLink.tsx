'use client';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useRef, type ComponentProps } from 'react';

type Props = ComponentProps<typeof NextLink>;

/**
 * next/link that prefetches on intent (pointer over, focus, touch) instead of for every link in view.
 * Prefetching a whole sidebar at load costs several long main-thread tasks on phones; prefetching
 * the one link someone is about to open keeps navigation instant without that cost.
 */
const SmartLink = forwardRef<HTMLAnchorElement, Props>(function SmartLink({ prefetch, onPointerEnter, onFocus, onTouchStart, href, ...rest }, ref) {
  const router = useRouter();
  const done = useRef(false);
  const warm = useCallback(() => {
    if (done.current || prefetch === false) return;
    const url = typeof href === 'string' ? href : href.pathname ?? '';
    if (!url.startsWith('/')) return;
    done.current = true;
    try { router.prefetch(url); } catch { /* prefetch is best-effort */ }
  }, [href, prefetch, router]);
  return (
    <NextLink ref={ref} href={href} prefetch={false} {...rest}
      onPointerEnter={(e) => { warm(); onPointerEnter?.(e); }}
      onFocus={(e) => { warm(); onFocus?.(e); }}
      onTouchStart={(e) => { warm(); onTouchStart?.(e); }} />
  );
});
export default SmartLink;
