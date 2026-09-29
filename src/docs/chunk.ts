import type { PageText, PolicyChunk } from './types';

/** Long clauses are split so a search hit always returns a readable amount of text. */
const MAX_CHUNK_CHARS = 1600;

interface Line {
  text: string;
  page: number;
  /** Baseline, when the text came from a PDF text layer. */
  y?: number;
  height?: number;
  pageHeight: number;
}

interface Draft {
  ref?: string;
  heading: string;
  section?: string;
  lines: Line[];
}

interface Heading {
  kind: 'section' | 'clause';
  ref?: string;
}

// "3.6 Room rent…", "Section 4.2 Waiting…", "12.10 Title"
const NUMBERED = /^(?:(?:clause|section|sec\.?|article|part)\s+)?(\d{1,2}(?:\.\d{1,3}){1,3})\.?\s+([A-Z(“"'].*)$/i;
// "3. Base covers", "Part B: Exclusions", "IV) General conditions"
const TOP_LEVEL = /^(?:(?:section|part|chapter)\s+)?(\d{1,2}|[A-H]|[IVX]{1,4})[.:)]\s+([A-Z].{2,90})$/;
// "Annexure II · List of…", "Section C - Benefits", "Schedule of benefits"
const NAMED = /^(section|part|chapter|schedule|annexure|appendix)\s+([A-Z0-9]{1,5})\b\s*[-–—·:.]?\s*(.*)$/i;
// IRDAI standard codes: "Excl02 Specified disease…", "Code-Excl01"
const CODE = /^(?:code\s*[-–]?\s*)?(excl|def|op|ip)\s*[-–]?\s*(\d{1,3})\b(.*)$/i;

function classify(text: string): Heading | null {
  if (text.length > 140) return null;

  const code = text.match(CODE);
  if (code) return { kind: 'clause', ref: `${capitalise(code[1])}${code[2].padStart(2, '0')}` };

  const numbered = text.match(NUMBERED);
  if (numbered && text.length < 120) return { kind: 'clause', ref: numbered[1] };

  const named = text.match(NAMED);
  if (named && text.length < 100) return { kind: 'section', ref: `${capitalise(named[1])} ${named[2].toUpperCase()}` };

  const top = text.match(TOP_LEVEL);
  if (top) return { kind: 'section', ref: top[1] };

  // A short line in capitals starts a new block. It could be a section title
  // ("EXCLUSIONS") but is as often a table header ("PROCEDURE SILVER GOLD"),
  // so it doesn't replace the numbered section the clause sits in.
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (text.length <= 90 && letters.length >= 5 && letters === letters.toUpperCase()) return { kind: 'clause' };

  return null;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function toLines(pages: PageText[]): Line[] {
  return pages.flatMap((p) =>
    p.lines.length
      ? p.lines.map((l) => ({ text: l.text, page: p.page, y: l.y, height: l.height, pageHeight: p.height }))
      : // OCR text has no positions; each line only knows its page.
        p.text.split('\n').map((t) => ({ text: t.trim(), page: p.page, pageHeight: p.height })),
  ).filter((l) => l.text);
}

/**
 * Splits a policy into clauses, each with the page and vertical band it
 * occupies. Headings are recognised from numbering ("3.6", "Section 4"),
 * IRDAI codes ("Excl02"), annexure names and capitalised titles.
 */
export function buildChunks(pages: PageText[]): PolicyChunk[] {
  const lines = toLines(pages);
  const chunks: Omit<PolicyChunk, 'id'>[] = [];
  let section: string | undefined;
  let current: Draft | null = null;

  const flush = () => {
    if (!current || !current.lines.length) {
      current = null;
      return;
    }
    const first = current.lines[0];
    const last = current.lines[current.lines.length - 1];
    const positioned = first.y !== undefined && first.height !== undefined;
    const bottom =
      last.page === first.page && last.y !== undefined ? last.y + (last.height ?? 10) * 0.45 : first.pageHeight - 8;
    chunks.push({
      ref: current.ref,
      heading: current.heading,
      section: current.section,
      text: current.lines.map((l) => l.text).join('\n'),
      location: positioned
        ? { page: first.page, top: first.y! - first.height! * 1.15, bottom }
        : { page: first.page },
    });
    current = null;
  };

  for (const line of lines) {
    const heading = classify(line.text);

    if (heading) {
      flush();
      if (heading.kind === 'section') section = line.text;
      current = { ref: heading.ref, heading: line.text, section, lines: [line] };
      continue;
    }

    if (!current) current = { heading: line.text, section, lines: [line] };
    else current.lines.push(line);

    // Very long clauses and annexure tables are sliced into readable pieces.
    const size = current.lines.reduce((n, l) => n + l.text.length + 1, 0);
    if (size > MAX_CHUNK_CHARS) {
      const { ref, heading: title, section: sec }: Draft = current;
      flush();
      current = { ref, heading: `${title.replace(/ \(continued\)$/, '')} (continued)`, section: sec, lines: [] };
    }
  }
  flush();

  // A heading with no text of its own (e.g. a section title right before its
  // first clause) is folded into the next chunk rather than left on its own.
  const merged: Omit<PolicyChunk, 'id'>[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (!c.text.trim()) continue;
    const next = chunks[i + 1];
    if (next && c.text.length < 80 && !c.text.includes('\n')) {
      next.text = `${c.text}\n${next.text}`;
      continue;
    }
    merged.push(c);
  }

  return merged.map((c, i) => ({ id: `C${i + 1}`, ...c }));
}
