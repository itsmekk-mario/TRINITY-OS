import { access } from 'node:fs/promises';

const DURABLE_OBJECT_STUB = `
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') {
    return {
      url: `data:text/javascript,${encodeURIComponent(DURABLE_OBJECT_STUB)}`,
      shortCircuit: true,
    };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    // Vite's bundler accepts extensionless TypeScript imports; Node's native
    // type stripping still needs their full file URL when running this suite.
    if (error.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.') || !context.parentURL?.startsWith('file:')) throw error;
    for (const suffix of ['.ts', '.js', '.mjs', '/index.ts', '/index.js']) {
      const candidate = new URL(specifier + suffix, context.parentURL);
      try { await access(candidate); } catch { continue; }
      return nextResolve(candidate.href, context);
    }
    throw error;
  }
}
