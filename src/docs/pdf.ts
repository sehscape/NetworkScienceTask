import type { PDFDocumentProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import type { PageText, TextLine } from './types';

type PdfJs = typeof import('pdfjs-dist');

let loading: Promise<PdfJs> | null = null;

/** pdf.js is ~1 MB with its worker, so it's only fetched once someone opens a document. */
function pdfjs() {
  loading ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    },
  );
  return loading;
}

export async function openPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  // pdf.js takes ownership of the buffer, so hand it a copy.
  return lib.getDocument({ data: new Uint8Array(data.slice(0)) }).promise;
}

/**
 * Pulls the text out of every page, grouped into visual lines with their
 * positions. Positions let us find "3.6 Room rent..." later and draw a
 * highlight band exactly where it sits on the rendered page.
 *
 * Pages are read several at a time: the worker parses one while the main
 * thread groups the last, which makes a 50-page wording about 3x faster.
 */
export async function readPages(pdf: PDFDocumentProxy, onPage?: (done: number) => void): Promise<PageText[]> {
  const pages: PageText[] = new Array(pdf.numPages);
  let next = 1;
  let done = 0;
  const worker = async () => {
    while (next <= pdf.numPages) {
      const n = next++;
      pages[n - 1] = await readPage(pdf, n);
      onPage?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, pdf.numPages) }, worker));
  return pages;
}

async function readPage(pdf: PDFDocumentProxy, n: number): Promise<PageText> {
  const page = await pdf.getPage(n);
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();

  const pieces = (content.items as TextItem[])
    .filter((item) => typeof item.str === 'string' && item.str.trim())
    .map((item) => {
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const height = Math.hypot(item.transform[2], item.transform[3]) || item.height || 10;
      return { str: item.str, x, y, width: item.width, height };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Group runs that share a baseline (a clause number in a mono font sits a
  // fraction of a point off its title), then read each line left to right.
  const groups: { y: number; height: number; pieces: typeof pieces }[] = [];
  for (const piece of pieces) {
    const group = groups[groups.length - 1];
    if (group && Math.abs(piece.y - group.y) < Math.max(2, Math.min(group.height, piece.height) * 0.5)) {
      group.pieces.push(piece);
      group.height = Math.max(group.height, piece.height);
    } else {
      groups.push({ y: piece.y, height: piece.height, pieces: [piece] });
    }
  }

  const lines: TextLine[] = groups.map((group) => {
    const runs = group.pieces.sort((a, b) => a.x - b.x);
    let text = '';
    let end = runs[0].x;
    for (const run of runs) {
      if (text && run.x - end > group.height * 0.15 && !text.endsWith(' ')) text += ' ';
      text += run.str;
      end = Math.max(end, run.x + run.width);
    }
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: runs[0].x,
      y: group.y,
      width: end - runs[0].x,
      height: group.height,
    };
  });

  page.cleanup();
  return {
    page: n,
    width: viewport.width,
    height: viewport.height,
    text: lines.map((l) => l.text).join('\n'),
    lines,
  };
}

/**
 * Starts rendering one page into a canvas at the given CSS width, sharp on
 * high-DPI screens. Returns the task so a resize can cancel it: pdf.js
 * refuses two renders into the same canvas at once.
 */
export async function renderPage(pdf: PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, cssWidth: number) {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  return page.render({ canvas, viewport });
}

/** A page as a JPEG (base64, no prefix) for the model or for OCR. */
export async function pageToJpeg(pdf: PDFDocumentProxy, pageNumber: number, maxSide = 1280, quality = 0.8) {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = maxSide / Math.max(base.width, base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, viewport }).promise;
  return canvasToBase64(canvas, quality);
}

export function canvasToBase64(canvas: HTMLCanvasElement, quality = 0.8) {
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}
