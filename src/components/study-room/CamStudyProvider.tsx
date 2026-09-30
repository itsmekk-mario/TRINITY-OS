import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, CameraOff, LogOut, Mic, MicOff, PictureInPicture2, Sparkles, Video } from 'lucide-react';
import type { AppData } from '../../types';
import { useCamera } from '../../hooks/useCamera';
import { useStudyRoom } from '../../hooks/useStudyRoom';
import { CAM_EFFECTS, type CamEffect, useVideoEffects } from '../../hooks/useVideoEffects';
import type { StudyRoomInfo } from '../../lib/studyRoom';

const IDLE_ROOM: StudyRoomInfo = { id: '', code: '', name: '', maxParticipants: 10, createdAt: '' };
type CamStudySession = {
  room?: StudyRoomInfo;
  camera: ReturnType<typeof useCamera>;
  videoStream?: MediaStream;
  effect: CamEffect;
  setEffect: (effect: CamEffect) => void;
  effectLoading: boolean;
  effectError: string;
  effectsOpen: boolean;
  setEffectsOpen: (open: boolean) => void;
  session: ReturnType<typeof useStudyRoom>;
  enterRoom: (room: StudyRoomInfo) => void;
  leaveRoom: () => void;
  focusedParticipantId?: string;
  setFocusedParticipantId: (id?: string) => void;
  pictureInPicture: { supported: boolean; active: boolean; toggle: () => Promise<void>; error: string };
};
const CamStudyContext = createContext<CamStudySession | undefined>(undefined);

type PipVideoElement = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

function MiniCam({ onOpen }: { onOpen: () => void }) {
  const { camera, videoStream, leaveRoom, room, session, pictureInPicture, setEffectsOpen, effect, effectLoading, effectError } = useCamStudy();
  const video = useRef<HTMLVideoElement>(null);
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    if (video.current && video.current.srcObject !== videoStream) video.current.srcObject = videoStream ?? null;
  }, [videoStream]);
  if (!room) return null;
  if (minimized) return <button className="cam-mini-collapsed" onClick={() => setMinimized(false)} aria-label="Cam Study 열기"><Video size={16} /> CAM</button>;
  const state = session.connectionState === 'connected' ? 'LIVE' : session.connectionState === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING';
  return <aside className="cam-mini" aria-label="Cam Study 연결 상태">
    <button className="cam-mini-preview" onClick={onOpen} aria-label="Cam Study로 이동">
      {camera.enabled && videoStream ? <video ref={video} autoPlay muted playsInline /> : <span><CameraOff size={22} />CAM OFF</span>}
      <b><i className={session.connectionState} />{state}</b>
    </button>
    <div className="cam-mini-actions">
      <button onClick={(event) => { event.stopPropagation(); camera.enabled ? camera.stop() : void camera.start(); }} aria-label={camera.enabled ? '카메라 끄기' : '카메라 켜기'}>{camera.enabled ? <Camera size={17} /> : <CameraOff size={17} />}</button>
      <button onClick={(event) => { event.stopPropagation(); camera.microphoneEnabled ? camera.stopMicrophone() : void camera.startMicrophone(); }} aria-label={camera.microphoneEnabled ? '마이크 끄기' : '마이크 켜기'}>{camera.microphoneEnabled ? <Mic size={17} /> : <MicOff size={17} />}</button>
      <button onClick={(event) => { event.stopPropagation(); void pictureInPicture.toggle(); }} disabled={!pictureInPicture.supported || !camera.enabled} aria-label={pictureInPicture.active ? '작은 화면 닫기' : '다른 앱 위에 카메라 띄우기'} title={!pictureInPicture.supported ? '이 브라우저는 PiP를 지원하지 않습니다' : '다른 앱 위에 카메라 띄우기'}><PictureInPicture2 size={17} /></button>
      <button onClick={(event) => { event.stopPropagation(); setEffectsOpen(true); }} aria-label="카메라 효과 열기" title="카메라 효과"><Sparkles size={17} /></button>
      <button onClick={(event) => { event.stopPropagation(); setMinimized(true); }} aria-label="Mini Cam 최소화">−</button>
    </div>
    {(pictureInPicture.error || effectError || effectLoading) && <small className="cam-pip-message" role="status">{pictureInPicture.error || effectError || `${effectLabel(effect)} 효과 준비 중…`}</small>}
    <button className="cam-mini-leave" onClick={(event) => { event.stopPropagation(); leaveRoom(); }} aria-label="방 나가기"><LogOut size={15} /></button>
  </aside>;
}

export function CamStudyProvider({ children, data, active, onOpen }: { children: ReactNode; data: AppData; active: boolean; onOpen: () => void }) {
  const [room, setRoom] = useState<StudyRoomInfo>();
  const [focusedParticipantId, setFocusedParticipantId] = useState<string>();
  const [effect, setEffect] = useState<CamEffect>('none');
  const [effectsOpen, setEffectsOpen] = useState(false);
  const camera = useCamera();
  const effects = useVideoEffects(camera.stream, effect);
  const videoStream = effects.stream ?? camera.stream;
  const pipVideo = useRef<PipVideoElement>(null);
  const [pipActive, setPipActive] = useState(false);
  const [pipError, setPipError] = useState('');
  const pipSupported = typeof document !== 'undefined' && (
    (typeof document.pictureInPictureEnabled === 'boolean' && document.pictureInPictureEnabled) ||
    typeof (HTMLVideoElement.prototype as PipVideoElement).webkitSupportsPresentationMode === 'function'
  );
  useEffect(() => {
    const video = pipVideo.current;
    if (!video) return;
    if (video.srcObject !== videoStream) video.srcObject = videoStream ?? null;
    if (videoStream) void video.play().catch(() => undefined);
  }, [videoStream]);
  useEffect(() => {
    const video = pipVideo.current;
    if (!video) return;
    const enter = () => { setPipActive(true); setPipError(''); };
    const exit = () => setPipActive(false);
    video.addEventListener('enterpictureinpicture', enter);
    video.addEventListener('leavepictureinpicture', exit);
    video.addEventListener('webkitpresentationmodechanged', () => {
      setPipActive(video.webkitPresentationMode === 'picture-in-picture');
    });
    return () => {
      video.removeEventListener('enterpictureinpicture', enter);
      video.removeEventListener('leavepictureinpicture', exit);
    };
  }, []);
  const togglePictureInPicture = useCallback(async () => {
    const video = pipVideo.current;
    if (!video || !camera.enabled || !videoStream) return;
    setPipError('');
    try {
      if (document.pictureInPictureElement === video) {
        await document.exitPictureInPicture();
      } else if (video.webkitPresentationMode === 'picture-in-picture') {
        video.webkitSetPresentationMode?.('inline');
      } else if (typeof video.requestPictureInPicture === 'function' && document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      } else if (video.webkitSupportsPresentationMode?.('picture-in-picture')) {
        video.webkitSetPresentationMode?.('picture-in-picture');
      } else {
        setPipError('이 브라우저에서는 작은 화면을 지원하지 않습니다.');
      }
    } catch {
      setPipError('작은 화면을 열지 못했습니다. 카메라 권한과 브라우저 설정을 확인해 주세요.');
    }
  }, [camera.enabled, videoStream]);
  const session = useStudyRoom(room?.code ?? '', room ?? IDLE_ROOM, data, videoStream, camera.enabled, camera.microphoneEnabled, focusedParticipantId, active);
  const enterRoom = useCallback((next: StudyRoomInfo) => { setFocusedParticipantId(undefined); setRoom(next); }, []);
  const leaveRoom = useCallback(() => { session.leave(); camera.stopAll(); setFocusedParticipantId(undefined); setRoom(undefined); }, [camera.stopAll, session.leave]);
  return <CamStudyContext.Provider value={{ room, camera, videoStream, effect, setEffect, effectLoading: effects.loading, effectError: effects.error, effectsOpen, setEffectsOpen, session, enterRoom, leaveRoom, focusedParticipantId, setFocusedParticipantId, pictureInPicture: { supported: pipSupported, active: pipActive, toggle: togglePictureInPicture, error: pipError } }}>
    {children}
    {!active && room && <MiniCam onOpen={onOpen} />}
    {room && <video ref={pipVideo} className="cam-pip-source" autoPlay muted playsInline aria-label="Study Cam picture in picture" />}
    {room && effectsOpen && <section className={`cam-effects-panel ${active ? 'in-room' : 'mini-room'}`} aria-label="카메라 효과 선택">
      <header><div><strong>Study Cam 효과</strong><small>{effects.loading ? `${effectLabel(effect)} 효과 불러오는 중…` : '본인 화면과 참가자에게 같은 효과를 적용합니다.'}</small></div><button onClick={() => setEffectsOpen(false)} aria-label="효과 창 닫기">×</button></header>
      <div className="cam-effects-options">{CAM_EFFECTS.map((option) => <button key={option.id} className={effect === option.id ? 'selected' : ''} onClick={() => setEffect(option.id)}>
        <b>{option.label}</b><small>{option.detail}</small>
      </button>)}</div>
      {effects.error && <p className="cam-effects-error" role="status">{effects.error}</p>}
      <p className="cam-effects-privacy">얼굴 추적과 배경 분리는 이 브라우저에서 처리합니다. 영상은 Study Room 송출에만 사용됩니다.</p>
    </section>}
  </CamStudyContext.Provider>;
}

function effectLabel(effect: CamEffect) {
  return CAM_EFFECTS.find((item) => item.id === effect)?.label ?? '카메라';
}

export function useCamStudy() {
  const value = useContext(CamStudyContext);
  if (!value) throw new Error('CamStudyProvider is required');
  return value;
}
