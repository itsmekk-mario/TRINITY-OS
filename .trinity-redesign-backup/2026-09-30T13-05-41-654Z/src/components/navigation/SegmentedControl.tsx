import type { CSSProperties } from 'react';

export type SegmentOption<T extends string> = { id: T; label: string; count?: number };

export default function SegmentedControl<T extends string>({ label, options, value, onChange, className = '' }: { label: string; options: readonly SegmentOption<T>[]; value: T; onChange: (value: T) => void; className?: string }) {
  const index = Math.max(0, options.findIndex((option) => option.id === value));
  const style = { '--segment-count': options.length, '--segment-index': index } as CSSProperties;
  return <div className={`segmented-control ${className}`} style={style} role="tablist" aria-label={label}>
    <span className="segmented-indicator" aria-hidden="true" />
    {options.map((option, position) => <button key={option.id} type="button" role="tab" tabIndex={value === option.id ? 0 : -1} aria-selected={value === option.id} className={value === option.id ? 'active' : ''} onClick={() => onChange(option.id)} onKeyDown={(event) => {
      const next = event.key === 'ArrowRight' ? (position + 1) % options.length : event.key === 'ArrowLeft' ? (position - 1 + options.length) % options.length : event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : null;
      if (next === null) return;
      event.preventDefault(); onChange(options[next].id);
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    }}>{option.label}{option.count !== undefined && <small>{option.count}</small>}</button>)}
  </div>;
}
