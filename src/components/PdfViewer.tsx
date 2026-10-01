import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { LoaderCircle, Maximize2, Minus, Plus, X } from 'lucide-react';
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfViewerProps = {
  url: string;
  title: string;
  onClose: () => void;
};

type PdfPageProps = {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  scrollRoot: MutableRefObject<HTMLDivElement | null>;
  onVisible: (pageNumber: number) => void;
};

function PdfPage({
  document,
  pageNumber,
  zoom,
  scrollRoot,
  onVisible,
}: PdfPageProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [ratio, setRatio] = useState(1.4142);
  const [width, setWidth] = useState(0);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          if (entry.intersectionRatio >= 0.38) onVisible(pageNumber);
        }
      },
      {
        root: scrollRoot.current,
        rootMargin: '900px 0px',
        threshold: [0, 0.38, 0.72],
      },
    );
    observer.observe(shell);
    return () => observer.disconnect();
  }, [onVisible, pageNumber, scrollRoot]);

  useEffect(() => {
    let cancelled = false;
    if (!nearViewport || width <= 0) return;

    const render = async () => {
      setRendering(true);
      try {
        const page = pageRef.current ?? (await document.getPage(pageNumber));
        if (cancelled) return;
        pageRef.current = page;

        const natural = page.getViewport({ scale: 1 });
        const nextRatio = natural.height / natural.width;
        setRatio(nextRatio);

        const cssWidth = Math.max(240, width);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const renderScale = (cssWidth / natural.width) * pixelRatio;
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        renderTaskRef.current?.cancel();
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${Math.round(cssWidth * nextRatio)}px`;

        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('PDF 캔버스를 초기화하지 못했습니다.');

        context.save();
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();

        const task = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          console.error(`PDF page ${pageNumber} render failed`, error);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [document, nearViewport, pageNumber, width, zoom]);

  return (
    <article
      ref={shellRef}
      className="pdf-document-page"
      data-page={pageNumber}
      style={{
        width: `${Math.round(zoom * 100)}%`,
        aspectRatio: `1 / ${ratio}`,
      }}
      aria-label={`${pageNumber}페이지`}
    >
      <canvas ref={canvasRef} />
      {!nearViewport && <div className="pdf-page-placeholder" />}
      {rendering && (
        <span className="pdf-page-loading" aria-label={`${pageNumber}페이지 렌더링 중`}>
          <LoaderCircle size={20} className="spin" />
        </span>
      )}
      <span className="pdf-page-number">{pageNumber}</span>
    </article>
  );
}

export default function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    const task = getDocument({ url });
    setDocument(null);
    setPageCount(0);
    setCurrentPage(1);
    setError('');

    void task.promise
      .then((nextDocument) => {
        if (disposed) {
          void nextDocument.destroy();
          return;
        }
        setDocument(nextDocument);
        setPageCount(nextDocument.numPages);
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? `PDF를 불러오지 못했습니다. ${reason.message}`
              : 'PDF를 불러오지 못했습니다.',
          );
        }
      });

    return () => {
      disposed = true;
      void task.destroy();
    };
  }, [url]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if ((event.ctrlKey || event.metaKey) && event.key === '=') {
        event.preventDefault();
        setZoom((value) => Math.min(2.2, Number((value + 0.15).toFixed(2))));
      }
      if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        setZoom((value) => Math.max(0.65, Number((value - 0.15).toFixed(2))));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const changeZoom = (delta: number) =>
    setZoom((value) =>
      Math.max(0.65, Math.min(2.2, Number((value + delta).toFixed(2)))),
    );

  return (
    <div className="pdf-document-backdrop" role="presentation">
      <section
        className="pdf-document-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} PDF`}
      >
        <header className="pdf-document-toolbar">
          <div className="pdf-document-title">
            <b>{title}</b>
            <span>
              {pageCount ? `${currentPage} / ${pageCount}` : 'PDF 불러오는 중'}
            </span>
          </div>
          <div className="pdf-document-controls" aria-label="PDF 보기 설정">
            <button
              type="button"
              aria-label="축소"
              disabled={zoom <= 0.65}
              onClick={() => changeZoom(-0.15)}
            >
              <Minus size={17} />
            </button>
            <button
              type="button"
              className="pdf-zoom-value"
              aria-label="화면 너비에 맞춤"
              title="화면 너비에 맞춤"
              onClick={() => setZoom(1)}
            >
              <Maximize2 size={15} />
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="확대"
              disabled={zoom >= 2.2}
              onClick={() => changeZoom(0.15)}
            >
              <Plus size={17} />
            </button>
            <button type="button" className="pdf-close" aria-label="PDF 닫기" onClick={onClose}>
              <X size={22} />
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="pdf-document-scroll">
          {error ? (
            <div className="pdf-document-state error">
              <b>PDF 표시 실패</b>
              <p>{error}</p>
            </div>
          ) : !document ? (
            <div className="pdf-document-state">
              <LoaderCircle size={28} className="spin" />
              <b>전체 페이지를 준비하는 중…</b>
            </div>
          ) : (
            <div className="pdf-document-pages">
              {Array.from({ length: pageCount }, (_, index) => (
                <PdfPage
                  key={index + 1}
                  document={document}
                  pageNumber={index + 1}
                  zoom={zoom}
                  scrollRoot={scrollRef}
                  onVisible={setCurrentPage}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
