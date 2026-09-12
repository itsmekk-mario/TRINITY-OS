import { createContext, useContext, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';

export const EmbeddedPageContext = createContext(false);
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  const embedded = useContext(EmbeddedPageContext);
  const Heading = embedded ? 'h2' : 'h1';
  return <header className={embedded ? 'page-header subpage-header' : 'page-header'}><div><p className="eyebrow">{eyebrow}</p><Heading>{title}</Heading>{description && <p className="page-description">{description}</p>}</div>{action}</header>;
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) { return <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />; }
export function SaveButton({ onClick, label = '저장' }: { onClick: () => void; label?: string }) { return <button className="button primary" onClick={onClick}><Check size={17} />{label}</button>; }
export function Empty({ children, title, description, action }: { children?: ReactNode; title?: string; description?: string; action?: ReactNode }) { return <div className="empty">{title ? <h3>{title}</h3> : children && <p>{children}</p>}{description && <p>{description}</p>}{action && <div className="empty-action">{action}</div>}</div>; }
export function Progress({ value, max = 100, label }: { value: number; max?: number; label?: string }) { const pct = Math.min(100, Math.round(value / Math.max(max, 1) * 100)); return <div className="progress-wrap">{label && <div className="progress-label"><span>{label}</span><b>{pct}%</b></div>}<div className="progress"><i style={{ width: `${pct}%` }} /></div></div>; }
export function SectionTitle({ title, meta }: { title: string; meta?: string }) { return <div className="section-title"><h2>{title}</h2>{meta && <span>{meta}</span>}</div>; }
export function RowLink({ title, detail, onClick }: { title: string; detail?: string; onClick?: () => void }) { return <button className="row-link" onClick={onClick}><span><b>{title}</b>{detail && <small>{detail}</small>}</span><ChevronRight size={18} /></button>; }
