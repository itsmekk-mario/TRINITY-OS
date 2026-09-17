import { useEffect, useState } from 'react';
import { ArrowRight, Plus, ShieldCheck, Video } from 'lucide-react';
import { Card, Field, PageHeader } from '../components/Ui';
import { createStudyRoom, getMediaServerStatus, joinStudyRoom, type MediaServerStatus, type StudyRoomInfo } from '../lib/studyRoom';

export default function StudyRoomLobby({ onEnter }: { onEnter: (room: StudyRoomInfo) => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('함께 집중하는 방');
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mediaStatus, setMediaStatus] = useState<MediaServerStatus>();
  const enter = async (action: () => Promise<{ room: StudyRoomInfo }>) => {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      onEnter(result.room);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Study Room 요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void getMediaServerStatus().then(setMediaStatus).catch(() => setMediaStatus({ online: false, status: 'offline' }));
    const queryCode = new URLSearchParams(window.location.search).get('room');
    if (queryCode) {
      setCode(queryCode);
      void enter(() => joinStudyRoom(queryCode));
    }
  }, []);
  return <div className="study-lobby">
    <PageHeader eyebrow="CAM STUDY" title="Study Room" description="친구들과 조용히 연결되어 각자의 공부에 집중하세요." />
    {mediaStatus && <div className={`study-room-notice media-${mediaStatus.status}`} role="status">
      <b>{mediaStatus.online ? '캠 서버 온라인' : '캠 서버 오프라인'}</b>
      <p>{mediaStatus.online ? '카메라와 마이크를 사용할 수 있습니다.' : '방 생성과 학습 기능은 계속 사용할 수 있으며 영상·음성만 제한됩니다.'}</p>
    </div>}
    <div className="study-lobby-grid">
      <Card className="study-lobby-primary">
        <span className="study-lobby-icon"><Video /></span>
        <h2>함께 공부할 공간 만들기</h2>
        <p>6자리 초대 코드를 공유한 학생만 들어올 수 있습니다. 작은 360p 캠 타일로 최대 6명을 권장합니다.</p>
        {!creating
          ? <button className="button primary" onClick={() => setCreating(true)}><Plus size={17} />새 방 만들기</button>
          : <div className="study-create-form">
              <Field label="방 이름"><input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></Field>
              <Field label="최대 인원">
                <div className="study-capacity" role="group" aria-label="최대 인원">
                  {[2, 4, 6, 10].map((value) => <button key={value} className={maxParticipants === value ? 'active' : ''} onClick={() => setMaxParticipants(value)}>{value}명</button>)}
                </div>
              </Field>
              <div>
                <button className="button" onClick={() => setCreating(false)}>취소</button>
                <button className="button primary" disabled={busy || !name.trim()} onClick={() => void enter(() => createStudyRoom(name, maxParticipants))}>방 만들기</button>
              </div>
            </div>}
      </Card>
      <Card className="study-lobby-join">
        <p className="eyebrow">INVITE ONLY</p>
        <h2>방 코드로 입장</h2>
        <Field label="6자리 초대 코드">
          <input
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={code}
            maxLength={8}
            placeholder="K7F2MX"
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ''))}
            onKeyDown={(event) => { if (event.key === 'Enter' && code.length >= 6) void enter(() => joinStudyRoom(code)); }}
          />
        </Field>
        <button className="button" disabled={busy || code.length < 6} onClick={() => void enter(() => joinStudyRoom(code))}>입장 <ArrowRight size={17} /></button>
      </Card>
    </div>
    {error && <p className="study-error" role="alert">{error}</p>}
    <div className="study-lobby-privacy"><ShieldCheck /><div><b>Privacy by design</b><p>카메라와 마이크는 직접 켤 때만 권한을 요청합니다. 영상과 음성은 녹화하거나 D1에 저장하지 않습니다.</p></div></div>
  </div>;
}
