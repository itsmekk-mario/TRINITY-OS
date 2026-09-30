import type { ReactNode } from 'react';
import { EmbeddedPageContext, PageHeader } from '../Ui';

/** Shared hub frame: title -> navigation -> working surface. */
export default function HubLayout({ eyebrow, title, description, controls, children }: { eyebrow: string; title: string; description: string; controls: ReactNode; children: ReactNode }) {
  return <div className="hub-page trinity-hub">
    <div className="hub-heading"><PageHeader eyebrow={eyebrow} title={title} description={description} /></div>
    <div className="hub-navigation" aria-label={`${eyebrow} navigation`}>{controls}</div>
    <EmbeddedPageContext.Provider value={true}><div className="hub-content">{children}</div></EmbeddedPageContext.Provider>
  </div>;
}
