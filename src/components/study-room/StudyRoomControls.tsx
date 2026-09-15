import { Camera, CameraOff, LogOut, SwitchCamera } from 'lucide-react';

export default function StudyRoomControls({ cameraEnabled, cameraStarting, onCamera, onFlip, onLeave }: { cameraEnabled: boolean; cameraStarting: boolean; onCamera: () => void; onFlip: () => void; onLeave: () => void }) {
  return <div className="study-controls" role="toolbar" aria-label="Study Room 컨트롤">
    <button className={cameraEnabled ? 'active' : ''} onClick={onCamera} disabled={cameraStarting} aria-label={cameraEnabled ? '카메라 끄기' : '카메라 켜기'}>{cameraEnabled ? <Camera /> : <CameraOff />}<span>{cameraStarting ? '시작 중' : cameraEnabled ? 'CAM ON' : 'CAM OFF'}</span></button>
    <button onClick={onFlip} disabled={!cameraEnabled || cameraStarting} aria-label="전면 후면 카메라 전환"><SwitchCamera /><span>카메라 전환</span></button>
    <button className="leave" onClick={onLeave} aria-label="Study Room 나가기"><LogOut /><span>나가기</span></button>
  </div>;
}
