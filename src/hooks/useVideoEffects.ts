import { useEffect, useState } from 'react';
import type { FaceLandmarker as FaceLandmarkerType, ImageSegmenter as ImageSegmenterType } from '@mediapipe/tasks-vision';

export type CamEffect = 'none' | 'paper-bag' | 'vtuber' | 'flowing-background' | 'monochrome' | 'neon-glitch';
export const CAM_EFFECTS: { id: CamEffect; label: string; detail: string }[] = [
  { id: 'none', label: '원본', detail: '효과 없이 카메라를 사용합니다.' },
  { id: 'paper-bag', label: '종이봉투', detail: '얼굴을 따라 종이봉투가 움직입니다.' },
  { id: 'vtuber', label: '버튜버', detail: '얼굴 움직임을 따라 2D 아바타가 움직입니다.' },
  { id: 'flowing-background', label: '흐르는 배경', detail: '사람을 분리해 움직이는 배경 위에 표시합니다.' },
  { id: 'monochrome', label: '시네마 흑백', detail: '선명한 흑백 필름 톤을 적용합니다.' },
  { id: 'neon-glitch', label: '네온 글리치', detail: '움직이는 네온 색 분리 효과를 적용합니다.' },
];

const FACE_MODEL = '/models/face_landmarker.task';
const SEGMENTER_MODEL = '/models/selfie_segmenter.tflite';
const WASM_FILES = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
type Point = { x: number; y: number; z?: number };

function drawBag(ctx: CanvasRenderingContext2D, face: Point[], width: number, height: number) {
  if (!face.length) return;
  const xs = face.map((point) => point.x * width);
  const ys = face.map((point) => point.y * height);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const faceWidth = maxX - minX; const faceHeight = maxY - minY;
  if (faceWidth < 8 || faceHeight < 8) return;
  const leftEye = face[33]; const rightEye = face[263];
  const angle = leftEye && rightEye ? Math.atan2((rightEye.y - leftEye.y) * height, (rightEye.x - leftEye.x) * width) : 0;
  const centerX = (minX + maxX) / 2; const centerY = minY + faceHeight * .52;
  ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(angle);
  const bagW = faceWidth * 1.38; const bagH = faceHeight * 1.3;
  const gradient = ctx.createLinearGradient(-bagW / 2, 0, bagW / 2, 0);
  gradient.addColorStop(0, '#a96e3f'); gradient.addColorStop(.5, '#d39b65'); gradient.addColorStop(1, '#a96e3f');
  ctx.fillStyle = gradient; ctx.strokeStyle = '#70452d'; ctx.lineWidth = Math.max(2, width / 360);
  ctx.beginPath(); ctx.moveTo(-bagW * .5, -bagH * .48); ctx.lineTo(bagW * .5, -bagH * .48); ctx.lineTo(bagW * .42, bagH * .5); ctx.lineTo(-bagW * .42, bagH * .5); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#17120f';
  for (const x of [-.21, .21]) { ctx.beginPath(); ctx.ellipse(x * bagW, -bagH * .04, bagW * .075, bagH * .055, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, bagH * .23, bagW * .09, .12, Math.PI - .12); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,190,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-bagW * .43, -bagH * .28); ctx.lineTo(bagW * .43, -bagH * .28); ctx.stroke();
  ctx.restore();
}

function drawAvatar(ctx: CanvasRenderingContext2D, face: Point[], width: number, height: number, time: number, mouthOpen: number) {
  if (!face.length) return;
  const xs = face.map((point) => point.x * width); const ys = face.map((point) => point.y * height);
  const faceW = Math.max(...xs) - Math.min(...xs); const faceH = Math.max(...ys) - Math.min(...ys);
  if (faceW < 8 || faceH < 8) return;
  const leftEye = face[33]; const rightEye = face[263];
  const angle = leftEye && rightEye ? Math.atan2((rightEye.y - leftEye.y) * height, (rightEye.x - leftEye.x) * width) : 0;
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2; const centerY = Math.min(...ys) + faceH * .52;
  ctx.save(); ctx.translate(centerX, centerY); ctx.rotate(angle);
  const w = faceW * 1.36; const h = faceH * 1.32; const bob = Math.sin(time / 420) * h * .012;
  ctx.translate(0, bob);
  ctx.fillStyle = '#31244c'; ctx.beginPath(); ctx.ellipse(0, -h * .08, w * .57, h * .58, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4c9d6'; ctx.beginPath(); ctx.ellipse(0, 0, w * .43, h * .49, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f3a9c7'; ctx.beginPath(); ctx.moveTo(-w * .48, -h * .18); ctx.quadraticCurveTo(-w * .1, -h * .72, w * .18, -h * .45); ctx.lineTo(w * .48, -h * .58); ctx.lineTo(w * .4, -h * .12); ctx.quadraticCurveTo(0, -h * .34, -w * .48, -h * .18); ctx.fill();
  for (const x of [-.19, .19]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x * w, -h * .015, w * .105, h * .13, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#623ca1'; ctx.beginPath(); ctx.ellipse(x * w, h * .005, w * .057, h * (.082 + Math.sin(time / 700) * .004), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x * w - w * .018, -h * .025, w * .02, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#40284f'; ctx.lineWidth = Math.max(2, w * .018); ctx.beginPath(); ctx.moveTo(x * w - w * .1, -h * .14); ctx.lineTo(x * w + w * .1, -h * .15); ctx.stroke();
  }
  if (mouthOpen > .16) {
    ctx.fillStyle = '#6f294d'; ctx.beginPath(); ctx.ellipse(0, h * .14, w * .075, h * (.035 + Math.min(.13, mouthOpen * .18)), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f477a0'; ctx.beginPath(); ctx.ellipse(0, h * .17, w * .038, h * .025, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = '#a4416d'; ctx.lineWidth = Math.max(2, w * .014); ctx.beginPath(); ctx.arc(0, h * .12, w * .08, .15, Math.PI - .15); ctx.stroke();
  }
  ctx.fillStyle = '#f28cae'; ctx.beginPath(); ctx.arc(-w * .29, h * .13, w * .07, 0, Math.PI * 2); ctx.arc(w * .29, h * .13, w * .07, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function useVideoEffects(input?: MediaStream, effect: CamEffect = 'none') {
  const [output, setOutput] = useState<MediaStream | undefined>(input);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!input || effect === 'none' || !input.getVideoTracks().some((track) => track.readyState === 'live')) {
      setOutput(input);
      setLoading(false);
      if (effect === 'none') setError('');
      return;
    }
    let disposed = false;
    let raf = 0;
    let renderAt = 0;
    let detectAt = 0;
    let segmentAt = 0;
    let landMarks: Point[] = [];
    let mouthOpen = 0;
    let personMask: Float32Array | undefined;
    let maskWidth = 0; let maskHeight = 0;
    let faceTask: FaceLandmarkerType | undefined;
    let segmenter: ImageSegmenterType | undefined;
    let media: MediaStream | undefined;
    let video: HTMLVideoElement | undefined;
    let canvas: HTMLCanvasElement | undefined;
    let ctx: CanvasRenderingContext2D | null = null;
    let subjectCanvas: HTMLCanvasElement | undefined;
    let subjectCtx: CanvasRenderingContext2D | null = null;
    let maskCanvas: HTMLCanvasElement | undefined;
    let maskCtx: CanvasRenderingContext2D | null = null;
    let maskImage: ImageData | undefined;

    const stop = () => {
      cancelAnimationFrame(raf);
      faceTask?.close(); segmenter?.close();
      media?.getTracks().forEach((track) => track.stop());
      if (video) { video.pause(); video.srcObject = null; }
    };
    setLoading(true); setError(''); setOutput(input);
    void (async () => {
      try {
        const wantsFace = effect === 'paper-bag' || effect === 'vtuber';
        const wantsBackground = effect === 'flowing-background';
        if (wantsFace || wantsBackground) {
          const { FaceLandmarker, FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
          const files = await FilesetResolver.forVisionTasks(WASM_FILES);
          if (disposed) return;
          if (wantsFace) {
            const options = { runningMode: 'VIDEO' as const, numFaces: 1, minFaceDetectionConfidence: .55, minFacePresenceConfidence: .5, outputFaceBlendshapes: true };
            try { faceTask = await FaceLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' } }); }
            catch { faceTask = await FaceLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' } }); }
          }
          if (wantsBackground && !disposed) {
            const options = { runningMode: 'VIDEO' as const, outputConfidenceMasks: true };
            try { segmenter = await ImageSegmenter.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate: 'GPU' } }); }
            catch { segmenter = await ImageSegmenter.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate: 'CPU' } }); }
          }
        }
        if (disposed) return;
        video = document.createElement('video'); video.muted = true; video.playsInline = true; video.srcObject = new MediaStream(input.getVideoTracks());
        await video.play();
        if (disposed) return;
        canvas = document.createElement('canvas');
        const ratio = Math.min(1, 960 / Math.max(video.videoWidth || 960, video.videoHeight || 540));
        canvas.width = Math.max(2, Math.round((video.videoWidth || 960) * ratio)); canvas.height = Math.max(2, Math.round((video.videoHeight || 540) * ratio));
        ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('카메라 효과 캔버스를 만들 수 없습니다.');
        if (wantsBackground) {
          subjectCanvas = document.createElement('canvas'); subjectCanvas.width = canvas.width; subjectCanvas.height = canvas.height;
          subjectCtx = subjectCanvas.getContext('2d');
          maskCanvas = document.createElement('canvas'); maskCanvas.width = 256; maskCanvas.height = 256;
          maskCtx = maskCanvas.getContext('2d');
        }
        media = canvas.captureStream(24);
        for (const track of input.getAudioTracks()) if (track.readyState === 'live') media.addTrack(track);
        if (!disposed) { setOutput(media); setLoading(false); }
        const labels = segmenter?.getLabels() ?? [];
        const personIndex = labels.findIndex((label) => /person|foreground|subject/i.test(label));
        const render = (time: number) => {
          if (disposed || !video || !ctx || !canvas || video.readyState < 2) return;
          raf = requestAnimationFrame(render);
          if (time - renderAt < 1000 / 24) return;
          renderAt = time;
          const w = canvas.width; const h = canvas.height;
          if (faceTask && time - detectAt > 95) {
            detectAt = time;
            try {
              const result = faceTask.detectForVideo(video, time);
              landMarks = result.faceLandmarks[0] ?? [];
              mouthOpen = result.faceBlendshapes[0]?.categories.find((item) => item.categoryName === 'jawOpen')?.score ?? 0;
            } catch { landMarks = []; mouthOpen = 0; }
          }
          if (segmenter && time - segmentAt > 135) {
            segmentAt = time;
            try {
              const result = segmenter.segmentForVideo(video, time);
              const masks = result.confidenceMasks;
              const mask = masks?.[personIndex >= 0 ? personIndex : Math.max(0, masks.length - 1)];
              if (mask) { personMask = mask.getAsFloat32Array(); maskWidth = mask.width; maskHeight = mask.height; }
              result.close();
            } catch { personMask = undefined; }
          }
          ctx.clearRect(0, 0, w, h);
          if (effect === 'flowing-background' && personMask && maskCanvas && maskCtx && subjectCanvas && subjectCtx && maskWidth && maskHeight) {
            const g = ctx.createLinearGradient(0, 0, w, h);
            const shift = (Math.sin(time / 1500) + 1) / 2;
            g.addColorStop(0, `hsl(${225 + shift * 70} 70% 16%)`); g.addColorStop(.5, `hsl(${285 + shift * 60} 80% 31%)`); g.addColorStop(1, `hsl(${180 + shift * 55} 78% 19%)`);
            ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
            ctx.save(); ctx.globalAlpha = .45;
            for (let i = 0; i < 5; i++) {
              const y = ((time / (35 + i * 5) + i * 97) % (h + 240)) - 120;
              ctx.fillStyle = `hsla(${190 + i * 32},85%,65%,.28)`;
              ctx.beginPath(); ctx.ellipse((w * (.12 + i * .18) + Math.sin(time / 900 + i) * 65), y, w * .27, h * .09, -.24, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
            maskCanvas.width = maskWidth; maskCanvas.height = maskHeight;
            maskImage = maskCtx.createImageData(maskWidth, maskHeight);
            for (let i = 0; i < personMask.length; i++) { const at = i * 4; maskImage.data[at] = maskImage.data[at + 1] = maskImage.data[at + 2] = 255; maskImage.data[at + 3] = Math.round(Math.max(0, Math.min(1, personMask[i])) * 255); }
            maskCtx.putImageData(maskImage, 0, 0);
            subjectCtx.clearRect(0, 0, w, h); subjectCtx.drawImage(video, 0, 0, w, h); subjectCtx.globalCompositeOperation = 'destination-in'; subjectCtx.filter = 'blur(2px)'; subjectCtx.drawImage(maskCanvas, 0, 0, w, h); subjectCtx.filter = 'none'; subjectCtx.globalCompositeOperation = 'source-over';
            ctx.drawImage(subjectCanvas, 0, 0);
          } else {
            ctx.save();
            if (effect === 'paper-bag') ctx.filter = 'saturate(.84) contrast(1.04)';
            if (effect === 'vtuber') ctx.filter = 'saturate(1.25) brightness(1.04)';
            if (effect === 'monochrome') ctx.filter = 'grayscale(1) contrast(1.2) brightness(1.04)';
            if (effect === 'neon-glitch') ctx.filter = 'saturate(1.75) contrast(1.12) hue-rotate(12deg)';
            ctx.drawImage(video, 0, 0, w, h); ctx.restore();
            if (effect === 'neon-glitch') {
              const offset = Math.sin(time / 78) * Math.max(3, w * .009);
              ctx.save(); ctx.globalAlpha = .22; ctx.globalCompositeOperation = 'screen'; ctx.filter = 'hue-rotate(125deg) saturate(1.8)';
              ctx.drawImage(video, offset, 0, w, h); ctx.restore();
              ctx.save(); ctx.globalAlpha = .18; ctx.fillStyle = '#29efff';
              const stripeY = (time * .18) % h; ctx.fillRect(0, stripeY, w, Math.max(2, h * .012)); ctx.restore();
            }
          }
          if (effect === 'paper-bag') drawBag(ctx, landMarks, w, h);
          if (effect === 'vtuber') drawAvatar(ctx, landMarks, w, h, time, mouthOpen);
        };
        raf = requestAnimationFrame(render);
      } catch (cause) {
        if (!disposed) { setError(cause instanceof Error ? `${cause.message} 원본 카메라로 전환했습니다.` : '효과를 불러오지 못했습니다. 원본 카메라로 전환했습니다.'); setOutput(input); setLoading(false); }
        stop();
      }
    })();
    return () => { disposed = true; stop(); };
  }, [effect, input]);

  return { stream: output, loading, error };
}
