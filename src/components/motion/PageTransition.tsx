import type { ReactNode } from 'react';

export default function PageTransition({ transitionKey, children }: { transitionKey: string; children: ReactNode }) {
  return <div key={transitionKey} className="page-transition">{children}</div>;
}

