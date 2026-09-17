import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, CameraOff, LogOut, Mic, MicOff, Video } from 'lucide-react';
import type { AppData } from '../../types';
import { useCamera } from '../../hooks/useCamera';
import { useStudyRoom } from '../../hooks/useStudyRoom';
import type { StudyRoomInfo } from '../../lib/studyRoom';

const IDLE_ROOM: StudyRoomInfo = { id: '', code: '', name: '', maxParticipants: 10, createdAt: '' };
type CamStudySession = {
  room?: StudyRoomInfo;
  camera: ReturnType<typeof useCamera>;
  session: ReturnType<typeof useStudyRoom>;
  enterRoom: (room: StudyRoomInfo) => void;
  leaveRoom: () => void;
};
const CamStudyContext = createContext<CamStudySession | undefined>(undefined);

function MiniCam({ onOpen }: { onOpen: () => void }) {
  const { camera, leaveRoom, room, session } = useCamStudy();
  const video = useRef<HTMLVideoElement>(null);
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    if (video.current && video.current.srcObject !== camera.stream) video.current.srcObject = camera.stream ?? null;
  }, [camera.stream]);
  if (!room) return null;
  if (minimized) return <button className="cam-mini-collapsed" onClick={() => setMinimized(false)} aria-label="Cam Study 열기"><Video size={16} /> CAM</button>;
  const state = session.connectionState === 'connected' ? 'LIVE' : session.connectionState === 'reconnecting' ? 'RECONNECTING' : 'CONNECTING';
  return <aside className="cam-mini" aria-label="Cam Study 연결 상태">
    <button className="cam-mini-preview" onClick={onOpen} aria-label="Cam Study로 이동">
      {camera.enabled && camera.stream ? <video ref={video} autoPlay muted playsInline /> : <span><CameraOff size={22} />CAM OFF</span>}
      <b><i className={session.connectionState} />{state}</b>
    </button>
    <div className="cam-mini-actions">
      <button onClick={(event) => { event.stopPropagation(); camera.enabled ? camera.stop() : void camera.start(); }} aria-label={camera.enabled ? '카메라 끄기' : '카메라 켜기'}>{camera.enabled ? <Camera size={17} /> : <CameraOff size={17} />}</button>
      <button onClick={(event) => { event.stopPropagation(); camera.microphoneEnabled ? camera.stopMicrophone() : void camera.startMicrophone(); }} aria-label={camera.microphoneEnabled ? '마이크 끄기' : '마이크 켜기'}>{camera.microphoneEnabled ? <Mic size={17} /> : <MicOff size={17} />}</button>
      <button onClick={(event) => { event.stopPropagation(); setMinimized(true); }} aria-label="Mini Cam 최소화">−</button>
      <button className="leave" onClick={(event) => { event.stopPropagation(); leaveRoom(); }} aria-label="방 나가기"><LogOut size={17} /></button>
    </div>
  </aside>;
}

export function CamStudyProvider({ children, data, active, onOpen }: { children: ReactNode; data: AppData; active: boolean; onOpen: () => void }) {
  const [room, setRoom] = useState<StudyRoomInfo>();
  const camera = useCamera();
  const session = useStudyRoom(room?.code ?? '', room ?? IDLE_ROOM, data, camera.stream, camera.enabled, camera.microphoneEnabled);
  const enterRoom = useCallback((next: StudyRoomInfo) => setRoom(next), []);
  const leaveRoom = useCallback(() => { session.leave(); camera.stopAll(); setRoom(undefined); }, [camera.stopAll, session.leave]);
  return <CamStudyContext.Provider value={{ room, camera, session, enterRoom, leaveRoom }}>
    {children}
    {!active && room && <MiniCam onOpen={onOpen} />}
  </CamStudyContext.Provider>;
}

export function useCamStudy() {
  const value = useContext(CamStudyContext);
  if (!value) throw new Error('CamStudyProvider is required');
  return value;
}
