import type { ReactNode } from 'react';

export default function PageTransition({ transitionKey, children }: { transitionKey: string; children: ReactNode }) {
  return <div key={transitionKey} className="page-transition">
    <div className="page-atmosphere" aria-hidden="true"><i /><i /><i /></div>
    <div className="page-transition-content">{children}</div>
  </div>;
}
