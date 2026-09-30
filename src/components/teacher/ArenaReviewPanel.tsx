import { useMemo } from 'react';
import { Card, Empty, SectionTitle } from '../Ui';
import { weekInRange, type TeacherData, type DateRange } from '../../lib/teacherAnalytics';
export default function ArenaReviewPanel({data,range}:{data:TeacherData;range:DateRange}) {
 const snapshots=useMemo(()=>data.arena?.snapshots.filter(item=>weekInRange(item.week_start,range))??[],[data.arena,range]);
 const latest=snapshots[0];
 return <section><SectionTitle title="ARENA · Growth Review" meta="읽기 전용"/><p className="teacher-panel-description">학생의 실행과 성장을 기존 ARENA 기록으로 확인합니다. ARENA 점수는 학업 성적이나 수학 능력 점수가 아닙니다.</p>
 {!data.arena?<Empty title="ARENA 열람 데이터를 불러올 수 없습니다." description="Worker가 최신 버전인지 확인한 뒤 새로고침해 주세요."/>:<>
 {latest?<Card><span className="eyebrow">최근 기록 · {latest.season} · v{latest.score_version}</span><h3>Learning Intelligence 기반 개선 흐름입니다.</h3><div className="teacher-facts">{[['ARENA',latest.score],['실행',latest.execution],['체화',latest.mastery],['성과',latest.performance],['꾸준함',latest.consistency],['성장',latest.growth]].map(([label,value])=><span key={label}>{label}<b>{value}</b></span>)}</div><small>주간 시작 {latest.week_start} · 계산 {latest.calculated_at.slice(0,10)}</small></Card>:<Empty title="선택 기간의 ARENA 기록이 없습니다." description="학생이 ARENA에서 계산한 성장 기록이 여기에 표시됩니다."/>}
 {snapshots.length>0&&<Card><SectionTitle title="주간 기록" meta={snapshots.length+'건'}/>{snapshots.map(item=><div className="teacher-arena-row" key={item.id}><div><b>{item.week_start}</b><small>{item.season}</small></div><b>{item.score}</b><span>실행 {item.execution} · 성장 {item.growth}</span></div>)}</Card>}
 <div className="teacher-support-grid"><Card><SectionTitle title="획득 배지" meta="전체 기록"/>{data.arena.achievements.length?data.arena.achievements.map(item=><article className="teacher-arena-item" key={item.id}><h3>{item.title}</h3><p>{item.description}</p><small>{item.awarded_at.slice(0,10)}</small></article>):<Empty>획득한 배지가 없습니다.</Empty>}</Card><Card><SectionTitle title="참여 그룹" meta="현재 상태"/>{data.arena.groups.length?data.arena.groups.map(item=><article className="teacher-arena-item" key={item.id}><h3>{item.name}</h3><small>{item.type==='university'?'대학':item.type==='department'?'학과':'학습 그룹'}</small></article>):<Empty>참여 중인 그룹이 없습니다.</Empty>}</Card></div></>}
 </section>;
}
