import { Camera, CameraOff, LogOut, Mic, MicOff, SwitchCamera } from 'lucide-react';

type Props = {
  cameraEnabled: boolean;
  cameraStarting: boolean;
  microphoneEnabled: boolean;
  microphoneStarting: boolean;
  onCamera: () => void;
  onMicrophone: () => void;
  onFlip: () => void;
  onLeave: () => void;
};

export default function StudyRoomControls(props: Props) {
  return <div className="study-controls" role="toolbar" aria-label="Study Room 컨트롤">
    <button
      className={props.cameraEnabled ? 'active' : ''}
      onClick={props.onCamera}
      disabled={props.cameraStarting}
      aria-label={props.cameraEnabled ? '카메라 끄기' : '카메라 켜기'}
    >
      {props.cameraEnabled ? <Camera /> : <CameraOff />}
      <span>{props.cameraStarting ? '시작 중' : props.cameraEnabled ? 'CAM ON' : 'CAM OFF'}</span>
    </button>
    <button
      className={props.microphoneEnabled ? 'active' : ''}
      onClick={props.onMicrophone}
      disabled={props.microphoneStarting}
      aria-label={props.microphoneEnabled ? '마이크 끄기' : '마이크 켜기'}
    >
      {props.microphoneEnabled ? <Mic /> : <MicOff />}
      <span>{props.microphoneStarting ? '시작 중' : props.microphoneEnabled ? 'MIC ON' : 'MIC OFF'}</span>
    </button>
    <button onClick={props.onFlip} disabled={!props.cameraEnabled || props.cameraStarting} aria-label="전면·후면 카메라 전환">
      <SwitchCamera /><span>카메라 전환</span>
    </button>
    <button className="leave" onClick={props.onLeave} aria-label="Study Room 나가기">
      <LogOut /><span>나가기</span>
    </button>
  </div>;
}
