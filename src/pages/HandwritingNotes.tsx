import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Eraser, PenLine, Plus, Redo2, Save, Trash2, Undo2 } from 'lucide-react';
import type { AppData, HandwritingNote, HandwritingPoint, HandwritingStroke, Subject } from '../types';
import { SUBJECTS } from '../data/config';
import { Card, Empty, Field, PageHeader } from '../components/Ui';
import { toDateKey, uid } from '../lib/date';

type Tool = 'pen' | 'eraser';

const blankNote = (): HandwritingNote => ({
  id: '',
  date: toDateKey(),
  subject: '수학',
  title: '',
  strokes: [],
  createdAt: '',
  updatedAt: '',
});

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const round = (value: number, digits = 4) => Number(value.toFixed(digits));

export default function HandwritingNotes({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeStroke = useRef<HandwritingStroke | null>(null);
  const drawing = useRef(false);
  const [note, setNote] = useState<HandwritingNote>(blankNote);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#172235');
  const [width, setWidth] = useState(4);
  const [redoStack, setRedoStack] = useState<HandwritingStroke[]>([]);
  const [notice, setNotice] = useState('');

  const notes = useMemo(
    () => [...data.handwritingNotes].sort((a, b) => (b.updatedAt || b.date).localeCompare(a.updatedAt || a.date)),
    [data.handwritingNotes],
  );

  const drawStroke = (ctx: CanvasRenderingContext2D, stroke: HandwritingStroke, displayWidth: number, displayHeight: number) => {
    if (stroke.points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    for (let index = 1; index < stroke.points.length; index += 1) {
      const prev = stroke.points[index - 1];
      const point = stroke.points[index];
      const pressure = stroke.tool === 'eraser' ? 1 : Math.max(0.25, point.pressure || 0.5);
      ctx.lineWidth = stroke.width * (stroke.tool === 'eraser' ? 3.4 : 0.65 + pressure * 0.75);
      ctx.beginPath();
      ctx.moveTo(prev.x * displayWidth, prev.y * displayHeight);
      ctx.lineTo(point.x * displayWidth, point.y * displayHeight);
      ctx.stroke();
    }
    ctx.restore();
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const nextWidth = Math.max(1, Math.round(rect.width * dpr));
    const nextHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    note.strokes.forEach((stroke) => drawStroke(ctx, stroke, rect.width, rect.height));
    if (activeStroke.current) drawStroke(ctx, activeStroke.current, rect.width, rect.height);
  };

  useEffect(() => {
    renderCanvas();
  }, [note.strokes]);

  useEffect(() => {
    const onResize = () => renderCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [note.strokes]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): HandwritingPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pressure = event.pointerType === 'mouse' ? 0.5 : event.pressure || 0.5;
    return {
      x: round(clamp((event.clientX - rect.left) / rect.width)),
      y: round(clamp((event.clientY - rect.top) / rect.height)),
      pressure: round(clamp(pressure), 2),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const first = pointFromEvent(event);
    activeStroke.current = {
      id: uid(),
      tool,
      color,
      width,
      points: [first, { ...first, x: round(Math.min(1, first.x + 0.0001)) }],
    };
    setRedoStack([]);
    renderCanvas();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !activeStroke.current) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const points = activeStroke.current.points;
    const last = points[points.length - 1];
    const distance = Math.hypot(point.x - last.x, point.y - last.y);
    if (distance < 0.0013) return;
    if (points.length >= 8000) return;
    activeStroke.current = { ...activeStroke.current, points: [...points, point] };
    renderCanvas();
  };

  const finishStroke = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event) event.preventDefault();
    if (!drawing.current || !activeStroke.current) return;
    const stroke = activeStroke.current;
    activeStroke.current = null;
    drawing.current = false;
    setNote((value) => ({ ...value, strokes: [...value.strokes, stroke] }));
  };

  const undo = () => {
    setNote((value) => {
      if (!value.strokes.length) return value;
      const removed = value.strokes[value.strokes.length - 1];
      setRedoStack((stack) => [...stack, removed]);
      return { ...value, strokes: value.strokes.slice(0, -1) };
    });
  };

  const redo = () => {
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const restored = stack[stack.length - 1];
      setNote((value) => ({ ...value, strokes: [...value.strokes, restored] }));
      return stack.slice(0, -1);
    });
  };

  const createNew = () => {
    setNote(blankNote());
    setRedoStack([]);
    setNotice('');
    requestAnimationFrame(renderCanvas);
  };

  const openNote = (value: HandwritingNote) => {
    setNote({ ...value, strokes: [...value.strokes] });
    setRedoStack([]);
    setNotice('');
    requestAnimationFrame(renderCanvas);
  };

  const save = () => {
    const now = new Date().toISOString();
    const next: HandwritingNote = {
      ...note,
      id: note.id || uid(),
      title: note.title.trim() || `${note.subject} 손글씨 노트`,
      createdAt: note.createdAt || now,
      updatedAt: now,
    };
    update((value) => ({
      ...value,
      handwritingNotes: note.id
        ? value.handwritingNotes.map((item) => item.id === note.id ? next : item)
        : [next, ...value.handwritingNotes],
    }));
    setNote(next);
    setNotice('저장했습니다.');
    window.setTimeout(() => setNotice(''), 1800);
  };

  const remove = () => {
    if (!note.id) return createNew();
    update((value) => ({ ...value, handwritingNotes: value.handwritingNotes.filter((item) => item.id !== note.id) }));
    createNew();
  };

  return <div className="handwriting-page">
    <PageHeader eyebrow="HANDWRITING NOTES" title="손으로 생각을 남깁니다" description="Apple Pencil·스타일러스·터치 입력을 스트로크 데이터로 저장해 가볍게 동기화합니다." action={<button className="button primary" onClick={createNew}><Plus size={16}/>새 노트</button>} />
    <div className="handwriting-layout">
      <Card className="handwriting-library">
        <div className="section-title"><h2>노트</h2><span>{notes.length}개</span></div>
        {notes.length ? <div className="handwriting-note-list">{notes.map((item) => <button key={item.id} className={item.id === note.id ? 'active' : ''} onClick={() => openNote(item)}><span className={`subject-badge ${item.subject}`}>{item.subject}</span><b>{item.title}</b><small>{item.date} · {item.strokes.length} strokes</small></button>)}</div> : <Empty>저장된 손글씨 노트가 없습니다.</Empty>}
      </Card>
      <Card className="handwriting-editor">
        <div className="handwriting-meta form-grid three">
          <Field label="날짜"><input type="date" value={note.date} onChange={(event) => setNote({ ...note, date: event.target.value })}/></Field>
          <Field label="과목"><select value={note.subject} onChange={(event) => setNote({ ...note, subject: event.target.value as Subject })}>{SUBJECTS.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="제목"><input value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="예: 확통 조건부확률 발상 정리"/></Field>
        </div>
        <div className="handwriting-toolbar" role="toolbar" aria-label="손글씨 도구">
          <div className="handwriting-tool-group">
            <button className={tool === 'pen' ? 'active' : ''} onClick={() => setTool('pen')}><PenLine size={16}/>펜</button>
            <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')}><Eraser size={16}/>지우개</button>
          </div>
          <div className="handwriting-colors" aria-label="펜 색상">{['#172235','#1565c0','#b42318','#18794e'].map((value) => <button key={value} type="button" aria-label={`색상 ${value}`} className={color === value ? 'active' : ''} style={{ '--ink': value } as CSSProperties} onClick={() => { setColor(value); setTool('pen'); }}/>)}</div>
          <label className="handwriting-width">굵기<select value={width} onChange={(event) => setWidth(Number(event.target.value))}><option value={2}>2</option><option value={4}>4</option><option value={7}>7</option><option value={11}>11</option></select></label>
          <div className="handwriting-tool-group right">
            <button disabled={!note.strokes.length} onClick={undo}><Undo2 size={16}/>Undo</button>
            <button disabled={!redoStack.length} onClick={redo}><Redo2 size={16}/>Redo</button>
          </div>
        </div>
        <div className="handwriting-paper-wrap">
          <canvas ref={canvasRef} className="handwriting-canvas" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={(event) => { if (event.buttons === 0) finishStroke(event); }}/>
        </div>
        <div className="handwriting-actions">
          {notice && <span role="status">{notice}</span>}
          <button className="button danger" disabled={!note.id} onClick={remove}><Trash2 size={15}/>삭제</button>
          <button className="button primary" onClick={save}><Save size={15}/>노트 저장</button>
        </div>
      </Card>
    </div>
  </div>;
}
