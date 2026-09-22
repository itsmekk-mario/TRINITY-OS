import { createElement, useMemo, useRef, useState, type ReactNode } from 'react';
import { evaluateMathExpression, parseMathExpression, type MathNode } from '../lib/mathExpression';

const TOKEN_PATTERN = /(\[\[graph:[\s\S]*?\]\]|\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;

const m = (tag: string, props: any, ...children: ReactNode[]) => createElement(tag, props, ...children);

const precedence = (node: MathNode): number => {
  if (node.kind === 'number' || node.kind === 'identifier' || node.kind === 'call') return 5;
  if (node.kind === 'unary') return 4;
  if (node.operator === '^') return 4;
  if (node.operator === '*' || node.operator === '/') return 3;
  if (node.operator === '+' || node.operator === '-') return 2;
  return 1;
};

function mathNode(node: MathNode, parent = 0, rightSide = false): ReactNode {
  const own = precedence(node);
  let body: ReactNode;
  if (node.kind === 'number') body = m('mn', null, String(node.value));
  else if (node.kind === 'identifier') body = m('mi', null, node.name.toLowerCase() === 'pi' ? 'π' : node.name);
  else if (node.kind === 'unary') body = m('mrow', null, m('mo', null, node.operator), mathNode(node.value, own));
  else if (node.kind === 'call') {
    const name = node.name.toLowerCase();
    if (name === 'sqrt' && node.args.length === 1) body = m('msqrt', null, mathNode(node.args[0]));
    else if (name === 'abs' && node.args.length === 1) body = m('mrow', null, m('mo', null, '|'), mathNode(node.args[0]), m('mo', null, '|'));
    else {
      const args: ReactNode[] = [];
      node.args.forEach((arg, index) => {
        if (index) args.push(m('mo', { key: `comma-${index}` }, ','));
        args.push(m('mrow', { key: `arg-${index}` }, mathNode(arg)));
      });
      body = m('mrow', null, m('mi', { mathvariant: 'normal' }, node.name), m('mo', null, '('), ...args, m('mo', null, ')'));
    }
  } else if (node.operator === '/') {
    body = m('mfrac', null, mathNode(node.left), mathNode(node.right));
  } else if (node.operator === '^') {
    body = m('msup', null, mathNode(node.left, own), mathNode(node.right, own, true));
  } else {
    const operator = node.operator === '*' ? '·' : node.operator === '<=' ? '≤' : node.operator === '>=' ? '≥' : node.operator;
    body = m('mrow', null, mathNode(node.left, own), m('mo', null, operator), mathNode(node.right, own, true));
  }
  const needsParens = own < parent || (rightSide && node.kind === 'binary' && (node.operator === '-' || node.operator === '/' || ['=', '<', '>', '<=', '>='].includes(node.operator)));
  return needsParens ? m('mrow', null, m('mo', null, '('), body, m('mo', null, ')')) : body;
}

export function Formula({ expression, display = false }: { expression: string; display?: boolean }) {
  const parsed = useMemo(() => {
    try { return { node: parseMathExpression(expression), error: '' }; }
    catch (error) { return { node: null, error: error instanceof Error ? error.message : '수식을 해석하지 못했습니다.' }; }
  }, [expression]);
  if (!parsed.node) return <code className="math-formula-error" title={parsed.error}>{expression}</code>;
  return <span className={display ? 'math-formula math-formula-display' : 'math-formula'}>{m('math', { display: display ? 'block' : 'inline', 'aria-label': expression }, mathNode(parsed.node))}</span>;
}

type GraphSpec = { expression: string; minX: number; maxX: number };

function parseGraphSpec(token: string): GraphSpec | null {
  const source = token.replace(/^\[\[graph:/, '').replace(/\]\]$/, '').trim();
  const parts = source.split(';').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return null;
  const expression = (parts[0].startsWith('y=') ? parts[0].slice(2) : parts[0]).trim();
  let minX = -5; let maxX = 5;
  for (const part of parts.slice(1)) {
    const raw = part.replace(/^(range|x)=/, '').trim();
    const range = raw.includes('..') ? raw.split('..') : raw.split(',');
    if (range.length !== 2) continue;
    const left = Number(range[0]); const right = Number(range[1]);
    if (Number.isFinite(left) && Number.isFinite(right) && left < right) { minX = left; maxX = right; }
  }
  return expression ? { expression, minX, maxX } : null;
}

function quantile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * ratio)));
  return values[index];
}

export function FunctionGraph({ expression, minX = -5, maxX = 5 }: GraphSpec) {
  const graph = useMemo(() => {
    try {
      const node = parseMathExpression(expression);
      const count = 320;
      const samples = Array.from({ length: count + 1 }, (_, index) => {
        const x = minX + (maxX - minX) * index / count;
        const y = evaluateMathExpression(node, { x });
        return { x, y };
      });
      const finite = samples.map((point) => point.y).filter((value) => Number.isFinite(value) && Math.abs(value) < 1e8).sort((a, b) => a - b);
      if (!finite.length) throw new Error('이 구간에서 그릴 수 있는 값이 없습니다.');
      let minY = quantile(finite, 0.03); let maxY = quantile(finite, 0.97);
      if (!Number.isFinite(minY) || !Number.isFinite(maxY)) throw new Error('그래프 범위를 계산하지 못했습니다.');
      if (Math.abs(maxY - minY) < 1e-9) { minY -= 1; maxY += 1; }
      const padding = (maxY - minY) * 0.12;
      minY -= padding; maxY += padding;
      if (minY > 0 && minY < (maxY - minY) * 0.4) minY = 0;
      if (maxY < 0 && -maxY < (maxY - minY) * 0.4) maxY = 0;
      return { samples, minY, maxY, error: '' };
    } catch (error) {
      return { samples: [] as {x:number;y:number}[], minY: -1, maxY: 1, error: error instanceof Error ? error.message : '그래프를 그리지 못했습니다.' };
    }
  }, [expression, minX, maxX]);

  if (graph.error) return <div className="math-graph-error"><b>그래프 오류</b><span>{graph.error}</span></div>;
  const width = 640; const height = 320; const padX = 42; const padY = 26;
  const innerW = width - padX * 2; const innerH = height - padY * 2;
  const sx = (value: number) => padX + (value - minX) / (maxX - minX) * innerW;
  const sy = (value: number) => padY + (graph.maxY - value) / (graph.maxY - graph.minY) * innerH;
  let path = ''; let drawing = false; let previousY: number | undefined;
  const visibleSpan = graph.maxY - graph.minY;
  for (const point of graph.samples) {
    const visible = Number.isFinite(point.y) && point.y >= graph.minY && point.y <= graph.maxY;
    const jump = previousY !== undefined && Math.abs(point.y - previousY) > visibleSpan * 0.65;
    if (!visible || jump) { drawing = false; previousY = Number.isFinite(point.y) ? point.y : undefined; continue; }
    path += `${drawing ? 'L' : 'M'}${sx(point.x).toFixed(2)} ${sy(point.y).toFixed(2)} `;
    drawing = true; previousY = point.y;
  }
  const xAxis = graph.minY <= 0 && graph.maxY >= 0 ? sy(0) : null;
  const yAxis = minX <= 0 && maxX >= 0 ? sx(0) : null;
  return <figure className="math-graph"><figcaption><span>y = <Formula expression={expression} /></span><small>x ∈ [{minX}, {maxX}]</small></figcaption><div className="math-graph-scroll"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`y=${expression} 함수 그래프`}>
    <rect x={padX} y={padY} width={innerW} height={innerH} className="math-graph-frame" />
    {xAxis !== null && <line x1={padX} x2={width-padX} y1={xAxis} y2={xAxis} className="math-graph-axis" />}
    {yAxis !== null && <line x1={yAxis} x2={yAxis} y1={padY} y2={height-padY} className="math-graph-axis" />}
    <path d={path.trim()} className="math-graph-line" />
    <text x={padX} y={height-7} className="math-graph-label">{minX}</text><text x={width-padX} y={height-7} textAnchor="end" className="math-graph-label">{maxX}</text>
    <text x={8} y={padY+5} className="math-graph-label">{Number(graph.maxY.toPrecision(3))}</text><text x={8} y={height-padY} className="math-graph-label">{Number(graph.minY.toPrecision(3))}</text>
  </svg></div></figure>;
}

export function RichMathText({ value, fallback = '—' }: { value?: string | null; fallback?: string }) {
  const source = value?.trim() ? value : fallback;
  const chunks = source.split(TOKEN_PATTERN).filter((chunk) => chunk !== '');
  return <div className="math-rich-text">{chunks.map((chunk, index) => {
    if (chunk.startsWith('[[graph:')) {
      const spec = parseGraphSpec(chunk);
      return spec ? <FunctionGraph key={index} {...spec} /> : <code key={index}>{chunk}</code>;
    }
    if (chunk.startsWith('$$') && chunk.endsWith('$$')) return <Formula key={index} expression={chunk.slice(2, -2)} display />;
    if (chunk.startsWith('$') && chunk.endsWith('$')) return <Formula key={index} expression={chunk.slice(1, -1)} />;
    return <span className="math-plain-text" key={index}>{chunk}</span>;
  })}</div>;
}

export function MathRecordEditor({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (value: string) => void; placeholder?: string; rows?: number }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [graphExpression, setGraphExpression] = useState('x^2');
  const [minX, setMinX] = useState('-5');
  const [maxX, setMaxX] = useState('5');
  const hasMath = /\$[^$]+\$|\[\[graph:/.test(value);

  const insert = (snippet: string) => {
    const target = textareaRef.current;
    const start = target?.selectionStart ?? value.length;
    const end = target?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
    onChange(next);
    window.requestAnimationFrame(() => {
      if (!target) return;
      target.focus();
      const position = start + snippet.length;
      target.setSelectionRange(position, position);
    });
  };

  const insertGraph = () => {
    const low = Number(minX); const high = Number(maxX);
    if (!graphExpression.trim() || !Number.isFinite(low) || !Number.isFinite(high) || low >= high) return;
    insert(`\n[[graph:y=${graphExpression.trim()};range=${low},${high}]]\n`);
  };

  return <div className="math-record-editor"><textarea ref={textareaRef} value={value} rows={rows} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /><div className="math-record-controls"><button type="button" className={toolsOpen ? 'math-tool-trigger active' : 'math-tool-trigger'} aria-expanded={toolsOpen} onClick={() => setToolsOpen((current) => !current)}><span aria-hidden="true">ƒx</span> 수식 · 그래프</button>{hasMath && <span>미리보기 활성</span>}</div>
    {toolsOpen && <div className="math-tool-panel"><div className="math-tool-head"><div><b>수학 기록 도구</b><small>수식은 $ ... $, 그래프는 함수식으로 저장됩니다.</small></div><button type="button" className="icon-button" aria-label="수학 도구 닫기" onClick={() => setToolsOpen(false)}>×</button></div><div className="math-symbol-row"><button type="button" onClick={() => insert('$x^2$')}>x²</button><button type="button" onClick={() => insert('$sqrt(x)$')}>√x</button><button type="button" onClick={() => insert('$(a)/(b)$')}>a/b</button><button type="button" onClick={() => insert('$sin(x)$')}>sin</button><button type="button" onClick={() => insert('$pi$')}>π</button><button type="button" onClick={() => insert('$$x^2 + y^2 = 1$$')}>큰 수식</button></div><div className="math-graph-builder"><label><span>y =</span><input value={graphExpression} onChange={(event) => setGraphExpression(event.target.value)} placeholder="x^2 또는 sin(x)" /></label><label><span>x 최소</span><input inputMode="decimal" value={minX} onChange={(event) => setMinX(event.target.value)} /></label><label><span>x 최대</span><input inputMode="decimal" value={maxX} onChange={(event) => setMaxX(event.target.value)} /></label><button type="button" onClick={insertGraph}><span aria-hidden="true">⌁</span> 그래프 삽입</button></div><p className="math-tool-help">지원 함수: sin, cos, tan, sqrt, abs, log, ln, exp · 상수: pi, e · 곱셈은 2x 또는 2*x 모두 가능</p></div>}
    {hasMath && <div className="math-live-preview"><span>PREVIEW</span><RichMathText value={value} /></div>}
  </div>;
}
