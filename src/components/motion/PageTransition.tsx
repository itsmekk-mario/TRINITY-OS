import { useEffect, useRef, type ReactNode } from 'react';

export default function PageTransition({ transitionKey, children }: { transitionKey: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !ref.current?.animate) return;
    const tokens = getComputedStyle(ref.current);
    const duration = parseFloat(tokens.getPropertyValue('--motion-base')) || 200;
    const animation = ref.current.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration, easing: tokens.getPropertyValue('--ease-standard').trim() || 'ease-out' });
    return () => animation.cancel();
  }, [transitionKey]);
  // Animate the surface, not its React identity: changing a tab must not reset focus.
  return <div ref={ref} className="page-transition">
    <div className="page-transition-content">{children}</div>
  </div>;
}
