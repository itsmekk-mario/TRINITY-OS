export const PRODUCTION_WORKER_URL = 'https://trinity-os-sync.khk090525.workers.dev';

export function trustedWorkerUrl(value?: string): string {
  if (import.meta.env.DEV && value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
    } catch { /* Fall through to the production origin. */ }
  }
  return PRODUCTION_WORKER_URL;
}
