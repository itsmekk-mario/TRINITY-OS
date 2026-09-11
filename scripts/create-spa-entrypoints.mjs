import { mkdir, readFile, writeFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const arenaHtml = html.replaceAll('="./', '="../');
const arenaDirectory = new URL('../dist/arena/', import.meta.url);

await mkdir(arenaDirectory, { recursive: true });
await writeFile(new URL('index.html', arenaDirectory), arenaHtml);
