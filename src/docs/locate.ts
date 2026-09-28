import type { ClauseHit, PageText, PolicyDocument, TextLine } from './types';

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "3.6", "Clause 4.2", "Section 5", "(b)", "12." ... at the start of a line
const HEADING = /^(?:clause|section|sec\.?|article|part)?\s*\(?\d+(?:\.\d+)*\)?[.:)]?\s+\S/i;

/** "Clause 3.6(b)" -> ["3.6(b)", "3.6", "3"], most specific first. */
export function refVariants(ref: string) {
  const match = ref.match(/\d+(?:\.\d+)*(?:\s*\([a-z0-9]{1,3}\))?/i);
  if (!match) return [];
  const out = [match[0].replace(/\s+/g, '')];
  const parts = match[0].replace(/\(.*$/, '').trim().split('.');
  for (let i = parts.length; i > 0; i--) {
    const v = parts.slice(0, i).join('.');
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function findHeading(page: PageText, variant: string) {
  const re = new RegExp(`^(?:clause|section|sec\\.?|article|part)?\\s*\\(?${escapeRe(variant)}\\)?(?=[\\s.:)\\-–]|$)`, 'i');
  return page.lines.findIndex((line) => re.test(line.text));
}

/** Band from a heading line down to just before the next heading (or a sensible cap). */
function bandFrom(lines: TextLine[], start: number, maxLines = 14): { top: number; bottom: number } {
  let end = start + 1;
  while (end < lines.length && end - start < maxLines && !HEADING.test(lines[end].text)) end++;
  const first = lines[start];
  const last = lines[end - 1];
  return { top: first.y - first.height * 1.15, bottom: last.y + last.height * 0.45 };
}

/**
 * Finds where a cited clause lives in the document: first by its number at
 * the start of a line, then by the quoted words. Returns null when neither
 * can be found, so the UI never highlights the wrong thing.
 */
export function locateClause(doc: PolicyDocument, ref: string, quote?: string): ClauseHit | null {
  const positioned = doc.pages.some((p) => p.lines.length > 0);
  const [exact, ...parents] = refVariants(ref);

  const byHeading = (variant?: string) => {
    if (!positioned || !variant) return null;
    for (const page of doc.pages) {
      const index = findHeading(page, variant);
      if (index >= 0) return { page: page.page, ...bandFrom(page.lines, index) };
    }
    return null;
  };

  // Exact number first, then the quoted words, and only then the parent
  // section ("3" for "3.6"), which is more likely to match something unrelated.
  const hit = byHeading(exact) ?? byQuote(doc, positioned, quote);
  if (hit) return hit;
  for (const parent of parents) {
    const parentHit = byHeading(parent);
    if (parentHit) return parentHit;
  }
  return null;
}

function byQuote(doc: PolicyDocument, positioned: boolean, quote?: string): ClauseHit | null {
  const words = normalise(quote ?? '').split(' ').filter(Boolean);
  if (words.length < 3) return null;

  // Try a few overlapping windows of the quote; the model sometimes trims or joins words.
  const probes = [0, 3, 6]
    .map((start) => words.slice(start, start + 6).join(' '))
    .filter((p) => p.split(' ').length >= 4);

  for (const probe of probes) {
    for (const page of doc.pages) {
      if (!positioned) {
        if (normalise(page.text).includes(probe)) return { page: page.page };
        continue;
      }
      // Walk lines, matching against a rolling window so quotes that wrap still match.
      const lines = page.lines;
      for (let i = 0; i < lines.length; i++) {
        const window = normalise(lines.slice(i, i + 3).map((l) => l.text).join(' '));
        if (window.includes(probe)) {
          const span = Math.min(lines.length - i, Math.max(2, Math.ceil(words.length / 9) + 1));
          const first = lines[i];
          const last = lines[i + span - 1];
          return { page: page.page, top: first.y - first.height * 1.15, bottom: last.y + last.height * 0.45 };
        }
      }
    }
  }

  return null;
}
