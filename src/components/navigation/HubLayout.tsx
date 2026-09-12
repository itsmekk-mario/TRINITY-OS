import type { ReactNode } from 'react';
import { EmbeddedPageContext, PageHeader } from '../Ui';

/** Keep the hub identity ahead of its subviews without losing child editing actions. */
export default function HubLayout({ eyebrow, title, description, controls, children }: { eyebrow: string; title: string; description: string; controls: ReactNode; children: ReactNode }) {
  return <div className="hub-page"><PageHeader eyebrow={eyebrow} title={title} description={description} />{controls}<EmbeddedPageContext.Provider value={true}><div className="hub-content">{children}</div></EmbeddedPageContext.Provider></div>;
}
