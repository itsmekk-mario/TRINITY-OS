import { mkdir, readFile, writeFile } from 'node:fs/promises';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
const nestedHtml = html.replaceAll('="./', '="../');
const routes = ['today', 'dashboard', 'plan', 'train', 'test', 'insights', 'study-room', 'coach', 'feedback', 'workspace', 'profile', 'archive', 'arena'];

await Promise.all(routes.map(async (route) => {
  const directory = new URL(`../dist/${route}/`, import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), nestedHtml);
}));
