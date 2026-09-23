import type { Subject } from '../types';
import type { YptStatus } from './ypt';

export function yptClockMismatch(remote: YptStatus, local: { running: boolean; subject: Subject; since?: string }): boolean {
  if (!remote.connected) return false;
  if (local.running !== (remote.state === 'running')) return true;
  return local.running && remote.state === 'running' && (
    remote.activeSubject !== local.subject ||
    remote.activeStartedAt !== Date.parse(local.since ?? '')
  );
}
