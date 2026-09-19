import { useEffect, useMemo, useState } from 'react';
import { Check, FilePlus2, Heading1, ListChecks, Plus, Text, Trash2 } from 'lucide-react';
import type { AppData, NotionBlock, NotionPage } from '../types';
import { Card, Empty, PageHeader } from '../components/Ui';
import { toDateKey, uid } from '../lib/date';

const createPage = (): NotionPage => ({ id: uid(), title: '새 페이지', icon: '📝', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), blocks: [] });
const block = (type: NotionBlock['type']): NotionBlock => ({ id: uid(), type, content: '', checked: false });
export default function NotionWorkspace({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(data.notionPages[0]?.id ?? null);
  const page = useMemo(() => data.notionPages.find((item) => item.id === selectedId) ?? data.notionPages[0], [data.notionPages, selectedId]);
  useEffect(() => { if (!selectedId && data.notionPages[0]) setSelectedId(data.notionPages[0].id); }, [data.notionPages, selectedId]);
  const savePage = (id: string, change: Partial<NotionPage>) => update((value) => ({ ...value, notionPages: value.notionPages.map((item) => item.id === id ? { ...item, ...change, updatedAt: new Date().toISOString() } : item) }));
  const addPage = () => { const item = createPage(); update((value) => ({ ...value, notionPages: [...value.notionPages, item] })); setSelectedId(item.id); };
  const deletePage = (id: string) => { update((value) => ({ ...value, notionPages: value.notionPages.filter((item) => item.id !== id) })); setSelectedId(data.notionPages.find((item) => item.id !== id)?.id ?? null); };
  const addBlock = (type: NotionBlock['type']) => page && savePage(page.id, { blocks: [...page.blocks, block(type)] });
  const updateBlock = (id: string, change: Partial<NotionBlock>) => page && savePage(page.id, { blocks: page.blocks.map((item) => item.id === id ? { ...item, ...change } : item) });
  const deleteBlock = (id: string) => page && savePage(page.id, { blocks: page.blocks.filter((item) => item.id !== id) });
  return <div><PageHeader eyebrow="PERSONAL WORKSPACE" title="Notion" description="개인 학습 노트, 생각, 체크리스트를 페이지와 블록으로 기록합니다." action={<button className="button primary" onClick={addPage}><FilePlus2 size={17} /> 새 페이지</button>} />
    <div className="notion-workspace"><Card className="notion-sidebar"><div className="notion-side-head"><span>PRIVATE PAGES</span><button onClick={addPage} aria-label="새 페이지"><Plus size={16} /></button></div>{data.notionPages.length ? <nav>{data.notionPages.map((item) => <button className={page?.id === item.id ? 'active' : ''} onClick={() => setSelectedId(item.id)} key={item.id}><span>{item.icon}</span><b>{item.title || '제목 없는 페이지'}</b></button>)}</nav> : <p>아직 페이지가 없습니다.</p>}</Card>
      {page ? <Card className="notion-editor"><div className="notion-page-top"><input value={page.icon} maxLength={4} aria-label="아이콘" onChange={(event) => savePage(page.id, { icon: event.target.value })} /><button className="icon-button danger" onClick={() => deletePage(page.id)} aria-label="페이지 삭제"><Trash2 size={17} /></button></div><input className="notion-title" value={page.title} onChange={(event) => savePage(page.id, { title: event.target.value })} placeholder="제목 없는 페이지" /><small className="notion-updated">마지막 수정 {new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date(page.updatedAt))}</small>
        <div className="notion-blocks">{page.blocks.map((item) => <div key={item.id} className={`notion-block ${item.type}`}><div className="block-main">{item.type === 'heading' ? <Heading1 size={17} /> : item.type === 'todo' ? <button className="notion-check" onClick={() => updateBlock(item.id, { checked: !item.checked })}>{item.checked ? <Check size={14} /> : '○'}</button> : <Text size={17} />}<textarea className={item.checked ? 'checked' : ''} rows={item.type === 'text' ? 3 : 1} value={item.content} onChange={(event) => updateBlock(item.id, { content: event.target.value })} placeholder={item.type === 'heading' ? '제목' : item.type === 'todo' ? '할 일' : '기록을 작성하세요'} /></div><button className="block-delete" onClick={() => deleteBlock(item.id)} aria-label="블록 삭제"><Trash2 size={14} /></button></div>)}</div>
        <div className="notion-add-block"><button onClick={() => addBlock('heading')}><Heading1 size={15} /> 제목</button><button onClick={() => addBlock('text')}><Text size={15} /> 텍스트</button><button onClick={() => addBlock('todo')}><ListChecks size={15} /> 체크리스트</button></div></Card> : <Empty>새 페이지를 만들어 기록을 시작하세요.</Empty>}
    </div><Card className="notion-data-note"><div><span className="card-label">LEARNING DATABASE</span><h3>학습 기록은 자동 연결됩니다</h3><p>Weekly · Monthly Plan, 실모 기록, Review Hub는 각각의 구조화된 데이터로 저장됩니다. Notion 탭은 그 밖의 생각과 개인 메모를 자유롭게 기록하는 공간입니다.</p></div><div><span>{data.monthlyPlans.filter((item) => item.month === toDateKey().slice(0, 7)).length} 월간 목표</span><span>{data.scores.length} 실모 기록</span><span>{Object.keys(data.journals).length} 저널</span></div></Card>
  </div>;
}
