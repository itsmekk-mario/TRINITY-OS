import type { WrongAnswerImage } from '../types';
import { loadCloudflareConfig } from './cloudflare';

const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 900 * 1024;
const MAX_EDGE = 1800;

export type PreparedProblemImage = {
  blob: Blob;
  previewUrl: string;
  name: string;
  mime: 'image/jpeg';
  width: number;
  height: number;
  size: number;
};

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(url);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('이미지를 읽지 못했습니다. JPG, PNG, WebP 형식을 사용해 주세요.'));
  };
  image.src = url;
});

const canvasBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지 압축에 실패했습니다.')), 'image/jpeg', quality);
});

export async function prepareProblemImage(file: File): Promise<PreparedProblemImage> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 첨부할 수 있습니다.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('원본 이미지는 15MB 이하만 첨부할 수 있습니다.');

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  let width = Math.max(1, Math.round(image.naturalWidth * scale));
  let height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지 압축을 초기화하지 못했습니다.');

  const render = async (quality: number) => {
    canvas.width = width;
    canvas.height = height;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    ctx.restore();
    return canvasBlob(canvas, quality);
  };

  let blob: Blob | null = null;
  const qualities = [0.84, 0.76, 0.68, 0.60, 0.52, 0.45];
  for (let round = 0; round < 4; round += 1) {
    for (const quality of qualities) {
      blob = await render(quality);
      if (blob.size <= MAX_OUTPUT_BYTES) break;
    }
    if (blob && blob.size <= MAX_OUTPUT_BYTES) break;
    width = Math.max(720, Math.round(width * 0.82));
    height = Math.max(720, Math.round(height * 0.82));
  }

  if (!blob || blob.size > MAX_OUTPUT_BYTES) {
    throw new Error('사진을 900KB 이하로 압축하지 못했습니다. 문제 영역만 잘라 다시 첨부해 주세요.');
  }

  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    name: file.name || 'problem-photo.jpg',
    mime: 'image/jpeg',
    width,
    height,
    size: blob.size,
  };
}

export function releasePreparedProblemImage(image?: PreparedProblemImage | null) {
  if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl);
}

const requestParts = () => {
  const config = loadCloudflareConfig();
  if (!config.url || !config.token) throw new Error('다시 로그인해 주세요.');
  return {
    base: config.url.replace(/\/+$/, ''),
    headers: { Authorization: `Bearer ${config.token}` },
  };
};

export async function uploadProblemImage(image: PreparedProblemImage): Promise<WrongAnswerImage> {
  const { base, headers } = requestParts();
  const query = new URLSearchParams({
    name: image.name,
    width: String(image.width),
    height: String(image.height),
  });
  const response = await fetch(`${base}/api/problem-images?${query.toString()}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': image.mime },
    body: image.blob,
  });
  const value = await response.json() as { image?: WrongAnswerImage; error?: string };
  if (!response.ok || !value.image) throw new Error(value.error || `문제 사진 업로드 실패 (${response.status})`);
  return value.image;
}

export async function deleteProblemImage(image?: WrongAnswerImage | null) {
  if (!image?.path) return;
  const { base, headers } = requestParts();
  const response = await fetch(`${base}/api/problem-images?path=${encodeURIComponent(image.path)}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok && response.status !== 404) {
    const value = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(value.error || `문제 사진 삭제 실패 (${response.status})`);
  }
}

export async function fetchProblemImageBlobUrl(image: WrongAnswerImage): Promise<string> {
  const { base, headers } = requestParts();
  const response = await fetch(`${base}/api/problem-images?path=${encodeURIComponent(image.path)}`, {
    headers,
    cache: 'no-store',
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(value.error || `문제 사진 불러오기 실패 (${response.status})`);
  }
  return URL.createObjectURL(await response.blob());
}
