import type { PolicyChunk } from './types';

/**
 * Full-text search over a policy's clauses, entirely in the browser.
 *
 * Ranking is BM25, the classic search-engine formula: a clause scores higher
 * when it contains the query's rarer words, more often, and is not padded
 * with unrelated text. Headings count double. It indexes a 100-page policy in
 * a few milliseconds and answers a query in well under one, which matters
 * because the live model waits for tool replies.
 */

const STOPWORDS = new Set(
  'a an and are as at be by for from has have if in into is it its of on or such that the their them then there these this those to was were will with we you your our us any all shall may can which who whom what when where how do does did per under upon than other each'.split(
    ' ',
  ),
);

// Everyday words callers use, mapped to the words policies use.
const SYNONYMS: Record<string, string[]> = {
  pregnancy: ['maternity', 'childbirth', 'delivery'],
  pregnant: ['maternity', 'childbirth'],
  baby: ['new', 'born', 'maternity'],
  room: ['rent'],
  icu: ['intensive', 'care'],
  ambulance: ['transport'],
  ped: ['pre', 'existing'],
  diabetes: ['pre', 'existing'],
  bp: ['pre', 'existing'],
  hernia: ['specified'],
  cataract: ['specified', 'eye'],
  kidney: ['calculus', 'urogenital', 'stone'],
  stone: ['calculus'],
  teeth: ['dental'],
  tooth: ['dental'],
  cosmetic: ['plastic'],
  abroad: ['outside', 'india', 'global'],
  deadline: ['within', 'days'],
  documents: ['document', 'submit'],
  cancel: ['cancellation', 'refund'],
  daycare: ['day', 'care'],
  opd: ['outpatient'],
  cashless: ['network', 'authorisation'],
  premium: ['renewal'],
};

function stem(word: string) {
  let w = word.replace(/isation/g, 'ization').replace(/ise$/, 'ize').replace(/ised$/, 'ized');
  if (w.length > 5 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string) {
  return normalise(text)
    .split(' ')
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

export const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** "Clause 3.6", "3.6.", "Code-Excl2" -> "3.6", "excl02" */
export function normaliseRef(ref: string) {
  const code = ref.match(/(excl|def|op|ip)\s*[-–]?\s*(\d{1,3})/i);
  if (code) return `${code[1].toLowerCase()}${code[2].padStart(2, '0')}`;
  const named = ref.match(/(annexure|appendix|schedule|section|part)\s+([a-z0-9]+)/i);
  if (named && !/\d+\.\d/.test(ref)) return `${named[1].toLowerCase()} ${named[2].toLowerCase()}`;
  const num = ref.match(/\d{1,2}(?:\.\d{1,3})*/);
  return num ? num[0] : normalise(ref);
}

export type QuoteCheck = { status: 'exact' | 'closest' | 'none'; text: string };

export interface SearchHit {
  chunk: PolicyChunk;
  score: number;
}

export class PolicyIndex {
  private postings = new Map<string, Map<number, number>>();
  private lengths: number[] = [];
  private avgLength = 1;
  private byIdMap = new Map<string, PolicyChunk>();

  constructor(readonly chunks: PolicyChunk[]) {
    chunks.forEach((chunk, i) => {
      this.byIdMap.set(chunk.id.toUpperCase(), chunk);
      // Headings count twice: "Room rent" in a title says more than in passing.
      const tokens = [...tokenize(chunk.heading), ...tokenize(chunk.heading), ...tokenize(chunk.text)];
      this.lengths[i] = tokens.length;
      for (const t of tokens) {
        const row = this.postings.get(t) ?? new Map<number, number>();
        row.set(i, (row.get(i) ?? 0) + 1);
        this.postings.set(t, row);
      }
    });
    this.avgLength = this.lengths.reduce((a, b) => a + b, 0) / Math.max(1, this.lengths.length);
  }

  byId(id: string | undefined) {
    return id ? this.byIdMap.get(id.trim().toUpperCase()) : undefined;
  }

  byRef(ref: string | undefined) {
    if (!ref) return [];
    const target = normaliseRef(ref);
    return this.chunks.filter((c) => c.ref && normaliseRef(c.ref) === target && !c.heading.endsWith('(continued)'));
  }

  search(query: string, limit = 4): SearchHit[] {
    return [...this.score(query).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([i, score]) => ({ chunk: this.chunks[i], score }));
  }

  /** Scores only the given clauses against a query, best first. */
  rank(query: string, among: PolicyChunk[]): SearchHit[] {
    const scores = this.score(query);
    return among
      .map((chunk) => ({ chunk, score: scores.get(this.chunks.indexOf(chunk)) ?? 0 }))
      .sort((a, b) => b.score - a.score);
  }

  private score(query: string) {
    const terms = new Set<string>();
    for (const t of tokenize(query)) {
      terms.add(t);
      for (const extra of SYNONYMS[t] ?? []) terms.add(stem(extra));
    }

    const n = this.chunks.length;
    const k1 = 1.2;
    const b = 0.75;
    const scores = new Map<number, number>();
    for (const term of terms) {
      const row = this.postings.get(term);
      if (!row) continue;
      const idf = Math.log(1 + (n - row.size + 0.5) / (row.size + 0.5));
      for (const [i, tf] of row) {
        const norm = tf + k1 * (1 - b + (b * this.lengths[i]) / this.avgLength);
        scores.set(i, (scores.get(i) ?? 0) + (idf * tf * (k1 + 1)) / norm);
      }
    }

    // A clause whose number is in the query ("what does 3.6 say") goes to the top.
    const refInQuery = query.match(/\b(\d{1,2}\.\d{1,3}(?:\.\d{1,3})?|excl\s*\d{1,3})\b/i);
    if (refInQuery) for (const c of this.byRef(refInQuery[1])) {
      const i = this.chunks.indexOf(c);
      scores.set(i, (scores.get(i) ?? 0) + 25);
    }
    return scores;
  }

  /**
   * Finds the clause a citation refers to: by id, then by printed number
   * (using the quote to choose between duplicates), then by the quote alone.
   */
  resolve(args: { id?: string; ref?: string; quote?: string }): PolicyChunk | undefined {
    const byId = this.byId(args.id);
    if (byId) return byId;

    const candidates = this.byRef(args.ref);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1 && args.quote) {
      return candidates
        .map((c) => ({ c, s: overlap(tokenize(args.quote!), tokenize(c.text)) }))
        .sort((a, b) => b.s - a.s)[0].c;
    }
    if (candidates.length) return candidates[0];

    if (args.quote && tokenize(args.quote).length >= 4) {
      const [top] = this.search(args.quote, 1);
      if (top && top.score > 4) return top.chunk;
    }
    return undefined;
  }
}

function overlap(a: string[], b: string[]) {
  if (!a.length) return 0;
  const set = new Set(b);
  return a.filter((t) => set.has(t)).length / a.length;
}

/**
 * Checks that a quote really appears in the clause. Returns the exact words
 * when it does; when the model paraphrased, returns the closest real sentence
 * instead, so the screen only ever shows wording that is in the policy.
 */
export function verifyQuote(chunk: PolicyChunk, quote: string): QuoteCheck {
  const body = normalise(chunk.text);
  const parts = quote
    .split(/\.{3}|…/)
    .map((p) => normalise(p))
    .filter((p) => p.split(' ').length >= 3);

  if (parts.length && parts.every((p) => body.includes(p))) return { status: 'exact', text: quote.trim() };

  const sentences = chunk.text
    .replace(/\n/g, ' ')
    .split(/(?<=[.;:])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  const want = tokenize(quote);
  let best = { s: '', score: 0 };
  for (const s of sentences) {
    const score = overlap(want, tokenize(s));
    if (score > best.score) best = { s, score };
  }
  if (best.score >= 0.45) return { status: 'closest', text: best.s };
  return { status: 'none', text: quote.trim() };
}

/** "3.6 Room rent and ICU limits" -> "Room rent and ICU limits" (the number is shown separately). */
export function clauseTitle(chunk: PolicyChunk) {
  const { heading, ref, section } = chunk;
  // A table ("PROCEDURE SILVER GOLD PLATINUM") is better named by the section it sits in.
  const letters = heading.replace(/[^A-Za-z]/g, '');
  if (!ref && section && letters && letters === letters.toUpperCase()) return `${section} (table)`;
  const title =
    ref && heading.toLowerCase().startsWith(ref.toLowerCase()) ? heading.slice(ref.length).replace(/^[\s.:·–—-]+/, '') : heading;
  return title.replace(/\s*\((?:code\s*-?\s*)?excl\d+\)\s*$/i, '') || heading;
}

/** A short excerpt of the clause around the first word of the query it contains. */
export function snippet(chunk: PolicyChunk, query: string, length = 150) {
  const body = chunk.text.split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim() || chunk.text;
  const lower = body.toLowerCase();
  const at = tokenize(query)
    .map((t) => lower.indexOf(t))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  if (at === undefined || at < 40) return body.length > length ? `${body.slice(0, length).trim()}…` : body;
  const start = body.lastIndexOf(' ', at - 30) + 1;
  const piece = body.slice(start, start + length).trim();
  return `…${piece}${start + length < body.length ? '…' : ''}`;
}

// One index per document, built on first use.
const cache = new WeakMap<PolicyChunk[], PolicyIndex>();
export function indexFor(chunks: PolicyChunk[]) {
  let index = cache.get(chunks);
  if (!index) {
    index = new PolicyIndex(chunks);
    cache.set(chunks, index);
  }
  return index;
}
