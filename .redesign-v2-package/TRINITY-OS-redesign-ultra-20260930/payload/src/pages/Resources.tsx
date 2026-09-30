import type { AppData } from '../types';
import { PageHeader } from '../components/Ui';
import ResourceLibrary from './ResourceLibrary';

export default function Resources({ data, update }: { data: AppData; update: (fn: (value: AppData) => AppData) => void }) {
  return <div className="resources-page">
    <PageHeader eyebrow="LIBRARY" title="자료에서 학습 기록까지 한 흐름으로" description="기출·PDF·교재를 보관하고 Daily Plan, Timer, Wrong Answer, Archive와 연결합니다." />
    <ResourceLibrary data={data} update={update}/>
  </div>;
}
