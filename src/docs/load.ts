import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';
import { buildChunks } from './chunk';
import { canvasToBase64, openPdf, pageToJpeg, readPages } from './pdf';
import type { PageText, PolicyChunk, PolicyDocument } from './types';

/**
 * Up to about 15k tokens the whole wording goes into the prompt, which is the
 * most accurate. Past that, every turn gets slower and the model starts to
 * lose clauses in the middle, so it gets an outline and searches instead.
 */
const FULL_CONTEXT_CHARS = 60_000;
const MAX_OUTLINE_CHARS = 90_000;
const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_OCR_PAGES = 60;
const OCR_BATCH = 4;
const OCR_PARALLEL = 3;

const SAMPLES = {
  health: 'kestrel-careplus.pdf',
  motor: 'kestrel-drivesure.pdf',
  supreme: 'kestrel-careplus-supreme.pdf',
} as const;
export type SampleName = keyof typeof SAMPLES;

export type LoadProgress = (message: string) => void;

// Open pdf.js documents, kept out of React state (they're big, mutable objects).
const openDocs = new Map<string, PDFDocumentProxy>();
export const getPdf = (id: string) => openDocs.get(id);

let counter = 0;
const newId = () => `doc${Date.now().toString(36)}${counter++}`;

export class DocumentError extends Error {}

export async function loadSample(sample: SampleName, onProgress?: LoadProgress) {
  const file = SAMPLES[sample];
  const res = await fetch(`/samples/${file}`);
  if (!res.ok) throw new DocumentError('Could not load the sample policy.');
  const doc = await loadPdf(await res.arrayBuffer(), file, onProgress);
  return { ...doc, sample };
}

/** Accepts one PDF, or one or more photos/scans of a policy. */
export async function loadFiles(files: File[], onProgress?: LoadProgress): Promise<PolicyDocument> {
  if (!files.length) throw new DocumentError('No file selected.');
  if (files.some((f) => f.size > MAX_FILE_BYTES)) throw new DocumentError('Files need to be under 40 MB.');

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

  const total = pdf.numPages;
  onProgress?.(`Reading ${total} ${total === 1 ? 'page' : 'pages'}…`);
  let pages = await readPages(pdf, (done) => {
    if (total > 8) onProgress?.(`Reading page ${done} of ${total}…`);
  });
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
    pages = pages.slice(0, count).map((p, i) => ({ ...p, text: texts[i] ?? '', lines: [] }));
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

/** Sends pages to /api/extract in batches, a few batches at a time. */
async function ocrImages(jpegs: string[], onProgress?: LoadProgress) {
  const texts: string[] = new Array(jpegs.length).fill('');
  const batches: number[] = [];
  for (let i = 0; i < jpegs.length; i += OCR_BATCH) batches.push(i);

  let pagesDone = 0;
  onProgress?.(`Reading text with Gemini: 0 of ${jpegs.length} pages…`);
  const worker = async () => {
    for (let start = batches.shift(); start !== undefined; start = batches.shift()) {
      const batch = jpegs.slice(start, start + OCR_BATCH);
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ images: batch.map((data) => ({ data, mimeType: 'image/jpeg' })) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(body.pages)) {
        throw new DocumentError(body.message ?? 'Could not read the text in those pages.');
      }
      batch.forEach((_, j) => (texts[start + j] = String(body.pages[j] ?? '')));
      pagesDone += batch.length;
      onProgress?.(`Reading text with Gemini: ${pagesDone} of ${jpegs.length} pages…`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(OCR_PARALLEL, batches.length) }, worker));
  return texts;
}

function finish(doc: Omit<PolicyDocument, 'chunks' | 'contextText' | 'contextMode'>): PolicyDocument {
  const chunks = buildChunks(doc.pages);
  if (!chunks.some((c) => c.text.trim().length > 20)) throw new DocumentError('No readable text was found in that file.');

  const full = fullText(chunks);
  if (full.length <= FULL_CONTEXT_CHARS) return { ...doc, chunks, contextText: full, contextMode: 'full' };
  return { ...doc, chunks, contextText: outline(doc.pages, chunks), contextMode: 'outline' };
}

/**
 * The wording with a marker before every clause, e.g. "[C12 · p.4]", so the
 * model can cite a clause by id instead of us guessing from its number.
 */
export function fullText(chunks: PolicyChunk[]) {
  return chunks.map((c) => `[${c.id} · p.${c.location.page}]\n${c.text}`).join('\n\n');
}

/**
 * For long policies: the first pages in full (the schedule: sum insured,
 * members, plan) and then one line per clause. The model reads clause text
 * on demand with search_policy.
 */
function outline(pages: PageText[], chunks: PolicyChunk[]) {
  const opening = fullText(chunks.filter((c) => c.location.page <= 2)).slice(0, 12_000);
  const lines: string[] = [];
  let section: string | undefined;
  for (const c of chunks) {
    if (c.location.page <= 2 || c.heading.endsWith('(continued)')) continue;
    if (c.section && c.section !== section) {
      section = c.section;
      lines.push(`\n${section}`);
    }
    lines.push(`${c.id} · p.${c.location.page} · ${c.heading.slice(0, 110)}`);
  }
  return [
    `This policy has ${pages.length} pages and ${chunks.length} clauses. Pages 1-2 are below in full, then an outline of every clause.`,
    'The outline only has headings: read a clause with search_policy before relying on it.',
    '',
    opening,
    '',
    'OUTLINE',
    lines.join('\n').slice(0, MAX_OUTLINE_CHARS),
  ].join('\n');
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
