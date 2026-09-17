import { Copy, ShieldCheck, Wifi } from 'lucide-react';
import type { ConnectionState, StudyParticipant, StudyRoomInfo } from '../../lib/studyRoom';
import type { CaptureDiagnostics } from '../../hooks/useCamera';
import type { VideoDiagnostics } from '../../hooks/useLiveKitRoom';

const totalLabel = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
const stateLabel = (state: ConnectionState) => state === 'connected' ? 'LIVE' : state === 'reconnecting' ? 'RECONNECTING' : state === 'offline' ? 'OFFLINE' : 'CONNECTING';
const quality = (stats?: { width?: number; height?: number; fps?: number; bitrateKbps?: number; codec?: string }) => stats?.width && stats?.height ? `${stats.width}×${stats.height} · ${stats.fps ?? '–'}fps · ${stats.bitrateKbps ?? '–'}kbps${stats.codec ? ` · ${stats.codec}` : ''}` : 'Waiting for media stats';

export default function StudyRoomHeader({ room, participants, connectionState, capture, diagnostics }: { room: StudyRoomInfo; participants: StudyParticipant[]; connectionState: ConnectionState; capture?: CaptureDiagnostics; diagnostics?: VideoDiagnostics }) {
  const total = participants.reduce((sum, participant) => sum + participant.studyState.todayMinutes, 0);
  const copy = () => void navigator.clipboard?.writeText(room.code);
  return <header className="study-room-header">
    <div className="study-header-title"><p className="eyebrow">CAM STUDY</p><h1>{room.name || 'Focus room'}</h1><span>집중 공간 · STUDY ROOM</span></div>
    <div className="study-header-status">
      <span className={`study-live-pill ${connectionState}`}><i />{stateLabel(connectionState)}</span>
      <span className="study-member-count">{participants.length} / {room.maxParticipants}</span>
      <span className="study-network"><Wifi size={14} />{connectionState === 'connected' ? '연결 양호' : stateLabel(connectionState)}</span>
      <button className="study-room-code" onClick={copy} aria-label="Copy room code"><small>ROOM CODE</small><b>{room.code}</b><Copy size={14} /></button>
    </div>
    <div className="study-room-subheader"><span><ShieldCheck size={15} /> LiveKit encrypted room · total focus {totalLabel(total)}</span><span className="study-header-hint">Click a participant to focus</span></div>
    {import.meta.env.DEV && <details className="study-diagnostics"><summary>MEDIA DIAGNOSTICS</summary><div><p><b>Capture</b>{capture?.width && capture?.height ? `${capture.width}×${capture.height} · ${capture.frameRate ?? '–'}fps` : 'Camera inactive'}</p><p><b>Outbound</b>{quality(diagnostics?.outbound)}</p><p><b>Focus inbound</b>{quality(diagnostics?.inbound)}</p></div></details>}
  </header>;
}
