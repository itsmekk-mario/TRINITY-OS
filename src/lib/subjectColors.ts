export type SubjectColorMap = Record<string, string>;

export const SUBJECT_COLOR_PALETTE = [
  '#475569',
  '#2563EB',
  '#4F46E5',
  '#7C3AED',
  '#DB2777',
  '#DC2626',
  '#EA580C',
  '#D97706',
  '#65A30D',
  '#059669',
  '#0891B2',
  '#0284C7',
] as const;

export const DEFAULT_SUBJECT_COLORS: SubjectColorMap = {
  국어: '#7C3AED',
  수학: '#2563EB',
  영어: '#DC2626',
  통사: '#D97706',
  통과: '#059669',
  탐구: '#0891B2',
};

const HEX = /^#[0-9a-f]{6}$/i;

const stableIndex = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % SUBJECT_COLOR_PALETTE.length;
};

export const isSubjectColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value);

export const getSubjectColor = (
  subject: string,
  colors?: SubjectColorMap,
) => {
  const selected = colors?.[subject];
  if (isSubjectColor(selected)) return selected.toUpperCase();
  if (DEFAULT_SUBJECT_COLORS[subject]) return DEFAULT_SUBJECT_COLORS[subject];
  return SUBJECT_COLOR_PALETTE[stableIndex(subject)];
};

export const buildDefaultSubjectColors = (subjects: readonly string[]) =>
  Object.fromEntries(
    subjects.map((subject) => [subject, getSubjectColor(subject)]),
  ) as SubjectColorMap;

const cssEscape = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
};

/**
 * Existing TRINITY screens already identify subjects with classes such as
 * `subject-badge 국어` and `subject-dot 수학`.  Instead of rewriting every
 * screen, install one generated stylesheet that gives all those existing
 * badges/dots the user's palette.
 */
export const applySubjectColorRules = (
  colors: SubjectColorMap | undefined,
  subjects: readonly string[],
) => {
  if (typeof document === 'undefined') return;

  const styleId = 'trinity-subject-color-rules';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  style.textContent = subjects
    .map((subject) => {
      const className = cssEscape(subject);
      const color = getSubjectColor(subject, colors);
      return `
.subject-badge.${className},
.subject-chip.${className},
.subject-pill.${className},
.subject-tag.${className} {
  --subject-color: ${color};
  color: ${color} !important;
  border-color: color-mix(in srgb, ${color} 30%, transparent) !important;
  background: color-mix(in srgb, ${color} 12%, transparent) !important;
}
.subject-dot.${className} {
  --subject-color: ${color};
  background: ${color} !important;
  box-shadow: 0 0 0 3px color-mix(in srgb, ${color} 15%, transparent);
}
`;
    })
    .join('\n');
};
