/**
 * Best-effort scrubbing of Indian identity/financial numbers before anything
 * is stored or sent on for the post-call report. The assistant is told never
 * to ask for these, but callers volunteer them anyway.
 */
const PATTERNS: [RegExp, string][] = [
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[card number removed]'],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[Aadhaar removed]'],
  [/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[PAN removed]'],
  [/\b\d{9,18}\b/g, '[number removed]'],
];

export function redact(text: string) {
  return PATTERNS.reduce((out, [pattern, label]) => out.replace(pattern, label), text);
}
