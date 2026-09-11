import type { CSSProperties } from 'react';

export type SegmentOption<T extends string> = { id: T; label: string; count?: number };

export default function SegmentedControl<T extends string>({ label, options, value, onChange, className = '' }: { label: string; options: readonly SegmentOption<T>[]; value: T; onChange: (value: T) => void; className?: string }) {
  const index = Math.max(0, options.findIndex((option) => option.id === value));
  const style = { '--segment-count': options.length, '--segment-index': index } as CSSProperties;
  return <div className={`segmented-control ${className}`} style={style} role="tablist" aria-label={label}>
    <span className="segmented-indicator" aria-hidden="true" />
    {options.map((option) => <button key={option.id} type="button" role="tab" aria-selected={value === option.id} className={value === option.id ? 'active' : ''} onClick={() => onChange(option.id)}>{option.label}{option.count !== undefined && <small>{option.count}</small>}</button>)}
  </div>;
}

