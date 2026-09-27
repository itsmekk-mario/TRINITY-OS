import { Camera, CameraOff, LogOut, Mic, MicOff, PictureInPicture2, Sparkles, SwitchCamera, MonitorUp } from 'lucide-react';

type Props = {
  cameraEnabled: boolean;
  cameraStarting: boolean;
  microphoneEnabled: boolean;
  microphoneStarting: boolean;
  screenShareSupported: boolean;
  screenShareEnabled: boolean;
  screenShareStarting: boolean;
  pictureInPictureSupported: boolean;
  pictureInPictureActive: boolean;
  onCamera: () => void;
  onMicrophone: () => void;
  onScreenShare: () => void;
  onFlip: () => void;
  onPictureInPicture: () => void;
  onEffects: () => void;
  onLeave: () => void;
};

export default function StudyRoomControls(props: Props) {
  return <div className="study-controls" role="toolbar" aria-label="Study Room controls">
    <button className={props.microphoneEnabled ? 'active' : 'muted'} onClick={props.onMicrophone} disabled={props.microphoneStarting} aria-label={props.microphoneEnabled ? 'Turn microphone off' : 'Turn microphone on'} title={props.microphoneEnabled ? 'Microphone on' : 'Microphone off'}>{props.microphoneEnabled ? <Mic /> : <MicOff />}<span>MIC</span></button>
    <button className={props.cameraEnabled ? 'active' : 'muted'} onClick={props.onCamera} disabled={props.cameraStarting} aria-label={props.cameraEnabled ? 'Turn camera off' : 'Turn camera on'} title={props.cameraEnabled ? 'Camera on' : 'Camera off'}>{props.cameraEnabled ? <Camera /> : <CameraOff />}<span>CAM</span></button>
    <button onClick={props.onPictureInPicture} disabled={!props.pictureInPictureSupported || !props.cameraEnabled} aria-label="Show camera in picture in picture" title={props.pictureInPictureSupported ? 'Show camera in a floating window outside this site' : 'Picture in picture is not supported by this browser'} className={props.pictureInPictureActive ? 'active' : ''}><PictureInPicture2 /><span>FLOAT</span></button>
    <button onClick={props.onEffects} aria-label="카메라 효과 열기" title="카메라 효과"><Sparkles /><span>EFFECT</span></button>
    <button
      className={props.screenShareEnabled ? 'active' : 'muted'}
      onClick={props.onScreenShare}
      disabled={!props.screenShareSupported || props.screenShareStarting}
      aria-label={props.screenShareEnabled ? 'Stop screen sharing' : 'Start screen sharing'}
      title={!props.screenShareSupported ? 'Screen sharing is not supported in this browser' : props.screenShareEnabled ? 'Stop screen sharing' : 'Share screen and audio'}
    ><MonitorUp /><span>SCREEN</span></button>
    <button onClick={props.onFlip} disabled={!props.cameraEnabled || props.cameraStarting} aria-label="Switch camera" title="Switch camera"><SwitchCamera /><span>FLIP</span></button>
    <span className="study-controls-divider" />
    <button className="leave" onClick={props.onLeave} aria-label="Leave room" title="Leave room"><LogOut /><span>LEAVE</span></button>
  </div>;
}
