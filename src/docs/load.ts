import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { canvasToBase64, openPdf, pageToJpeg, readPages } from './pdf';
import type { PageText, PolicyDocument } from './types';

/** Roughly 40k tokens: plenty for a full policy wording, and leaves room for the call. */
const MAX_CONTEXT_CHARS = 160_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_OCR_PAGES = 24;
const OCR_BATCH = 4;

export type LoadProgress = (message: string) => void;

// Open pdf.js documents, kept out of React state (they're big, mutable objects).
const openDocs = new Map<string, PDFDocumentProxy>();
export const getPdf = (id: string) => openDocs.get(id);

let counter = 0;
const newId = () => `doc${Date.now().toString(36)}${counter++}`;

export class DocumentError extends Error {}

export async function loadSample(sample: 'health' | 'motor', onProgress?: LoadProgress) {
  const file = sample === 'health' ? 'kestrel-careplus.pdf' : 'kestrel-drivesure.pdf';
  const res = await fetch(`/samples/${file}`);
  if (!res.ok) throw new DocumentError('Could not load the sample policy.');
  const doc = await loadPdf(await res.arrayBuffer(), file, onProgress);
  return { ...doc, sample };
}

/** Accepts one PDF, or one or more photos/scans of a policy. */
export async function loadFiles(files: File[], onProgress?: LoadProgress): Promise<PolicyDocument> {
  if (!files.length) throw new DocumentError('No file selected.');
  if (files.some((f) => f.size > MAX_FILE_BYTES)) throw new DocumentError('Files need to be under 25 MB.');

  const pdf = files.find((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
  if (pdf) return loadPdf(await pdf.arrayBuffer(), pdf.name, onProgress);

  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) throw new DocumentError('Upload a PDF or photos (JPG, PNG, WebP) of your policy.');
  return loadImages(images, onProgress);
}

async function loadPdf(data: ArrayBuffer, name: string, onProgress?: LoadProgress): Promise<PolicyDocument> {
  onProgress?.('Opening PDF…');
  let pdf: PDFDocumentProxy;
  try {
    pdf = await openPdf(data);
  } catch {
    throw new DocumentError('That PDF could not be opened. Is it password protected?');
  }

  onProgress?.(`Reading ${pdf.numPages} ${pdf.numPages === 1 ? 'page' : 'pages'}…`);
  let pages = await readPages(pdf);
  let ocr = false;

  // A scanned PDF has pages but almost no text layer. Read it with Gemini instead.
  const chars = pages.reduce((n, p) => n + p.text.length, 0);
  if (chars / pages.length < 80) {
    ocr = true;
    const count = Math.min(pdf.numPages, MAX_OCR_PAGES);
    const jpegs: string[] = [];
    for (let n = 1; n <= count; n++) {
      onProgress?.(`Scanned PDF: preparing page ${n} of ${count}…`);
      jpegs.push(await pageToJpeg(pdf, n, 1600, 0.72));
    }
    const texts = await ocrImages(jpegs, onProgress);
    pages = pages.map((p, i) => ({ ...p, text: texts[i] ?? '', lines: [] }));
  }

  const doc = finish({ id: newId(), name, kind: 'pdf', pages, ocr });
  openDocs.set(doc.id, pdf);
  return doc;
}

async function loadImages(files: File[], onProgress?: LoadProgress): Promise<PolicyDocument> {
  const imageUrls: string[] = [];
  const jpegs: string[] = [];
  const sizes: { width: number; height: number }[] = [];

  for (const [i, file] of files.entries()) {
    onProgress?.(`Preparing photo ${i + 1} of ${files.length}…`);
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    imageUrls.push(url);
    sizes.push({ width: img.naturalWidth, height: img.naturalHeight });

    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    jpegs.push(canvasToBase64(canvas, 0.72));
  }

  const texts = await ocrImages(jpegs, onProgress);
  const pages: PageText[] = sizes.map((size, i) => ({ page: i + 1, ...size, text: texts[i] ?? '', lines: [] }));
  return finish({
    id: newId(),
    name: files.length === 1 ? files[0].name : `${files.length} photos`,
    kind: 'images',
    pages,
    imageUrls,
    ocr: true,
  });
}

async function ocrImages(jpegs: string[], onProgress?: LoadProgress) {
  const texts: string[] = [];
  for (let i = 0; i < jpegs.length; i += OCR_BATCH) {
    const batch = jpegs.slice(i, i + OCR_BATCH);
    onProgress?.(`Reading text with Gemini: pages ${i + 1}–${i + batch.length} of ${jpegs.length}…`);
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ images: batch.map((data) => ({ data, mimeType: 'image/jpeg' })) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(body.pages)) {
      throw new DocumentError(body.message ?? 'Could not read the text in those pages.');
    }
    texts.push(...batch.map((_, j) => String(body.pages[j] ?? '')));
  }
  return texts;
}

function finish(doc: Omit<PolicyDocument, 'contextText' | 'truncated'>): PolicyDocument {
  let contextText = doc.pages.map((p) => `[Page ${p.page}]\n${p.text}`).join('\n\n');
  const truncated = contextText.length > MAX_CONTEXT_CHARS;
  if (truncated) contextText = `${contextText.slice(0, MAX_CONTEXT_CHARS)}\n\n[...document truncated]`;
  if (!contextText.replace(/\[Page \d+\]/g, '').trim()) throw new DocumentError('No readable text was found in that file.');
  return { ...doc, contextText, truncated };
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new DocumentError('One of the photos could not be opened.'));
    img.src = url;
  });
}

export function releaseDocument(doc: PolicyDocument) {
  void openDocs.get(doc.id)?.loadingTask.destroy();
  openDocs.delete(doc.id);
  doc.imageUrls?.forEach((url) => URL.revokeObjectURL(url));
}

/** A frame of a page for the live model: what the caller is looking at right now. */
export async function pageSnapshot(doc: PolicyDocument, page: number) {
  const pdf = openDocs.get(doc.id);
  if (pdf) return pageToJpeg(pdf, page, 1280, 0.8);

  const url = doc.imageUrls?.[page - 1];
  if (!url) return null;
  const img = await loadImage(url);
  const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasToBase64(canvas, 0.8);
}
