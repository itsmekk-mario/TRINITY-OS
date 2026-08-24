import type { ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</header>;
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function TextArea({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) { return <textarea value={value} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />; }
export function SaveButton({ onClick, label = '저장' }: { onClick: () => void; label?: string }) { return <button className="button primary" onClick={onClick}><Check size={17} />{label}</button>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty"><span className="empty-mark">T</span><p>{children}</p></div>; }
export function Progress({ value, max = 100, label }: { value: number; max?: number; label?: string }) { const pct = Math.min(100, Math.round(value / Math.max(max, 1) * 100)); return <div className="progress-wrap">{label && <div className="progress-label"><span>{label}</span><b>{pct}%</b></div>}<div className="progress"><i style={{ width: `${pct}%` }} /></div></div>; }
export function SectionTitle({ title, meta }: { title: string; meta?: string }) { return <div className="section-title"><h2>{title}</h2>{meta && <span>{meta}</span>}</div>; }
export function RowLink({ title, detail, onClick }: { title: string; detail?: string; onClick?: () => void }) { return <button className="row-link" onClick={onClick}><span><b>{title}</b>{detail && <small>{detail}</small>}</span><ChevronRight size={18} /></button>; }
