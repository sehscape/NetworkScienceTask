import { tokenize, type PolicyIndex } from '../docs/search';
import type { PolicyChunk } from '../docs/types';

/**
 * A safety net for citations.
 *
 * With a long policy the live model searches first and answers second, and
 * on that second step it sometimes forgets to call cite_clause, while still
 * saying "I've highlighted it for you". When a turn goes like that, the app
 * pins the clause the answer rested on itself: the one whose number was said
 * out loud, or else the search result that best matches what was said,
 * scored the same way the search itself scores clauses.
 */

export interface ImpliedCitation {
  chunk: PolicyChunk;
  quote: string;
  meaning: string;
}

/** "10.3" -> matches "10.3", "10 3", "10. 3"; "Excl02" -> "Excl02", "excl 2", "exclusion 02". */
function spokenRef(ref: string) {
  const code = ref.match(/^(excl|def|op|ip)0*(\d{1,3})$/i);
  if (code) return new RegExp(`\\b${code[1]}\\w*\\s*0*${code[2]}\\b`, 'i');
  const parts = ref.match(/^\d{1,2}(?:\.\d{1,3})+$/) ? ref.split('.') : null;
  return parts ? new RegExp(`(?<![\\d.])${parts.join('[\\s.]+')}(?![\\d.])`) : null;
}

function mentioned(answer: string, chunks: PolicyChunk[]) {
  return chunks.find((c) => c.ref && spokenRef(c.ref)?.test(answer));
}

/** The sentence of the clause that the answer echoes most, so the pin shows the words that matter. */
function bestSentence(chunk: PolicyChunk, answer: string) {
  const said = new Set(tokenize(answer));
  // Prose splits into sentences; a table (no full stops) splits into its rows.
  const sentences = chunk.text
    .split('\n')
    .slice(1)
    .join('\n')
    .split(/(?<=[.;])\s+/)
    .flatMap((s) => (s.length > 300 ? s.split('\n') : [s.replace(/\n/g, ' ')]))
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  let best = { text: sentences[0] ?? chunk.text, score: -1 };
  for (const s of sentences) {
    const words = tokenize(s);
    const score = words.filter((w) => said.has(w)).length / Math.max(4, words.length);
    if (score > best.score) best = { text: s, score };
  }
  return best.text.length > 320 ? `${best.text.slice(0, 317)}…` : best.text;
}

const ACKNOWLEDGEMENT = /\b(let me|sure|checking|check that|one moment|help with that)\b|देखता|देखती|चेक/i;
// "I've highlighted clause 10.3, which says that you need to…" -> "You need to…"
const HIGHLIGHT_LEAD = /^.*?(?:highlight|हाईलाइट)\w*.*?\b(?:which|that)\s+(?:says|states|explains|mentions|shows)\s+(?:that\s+)?(.{20,})$/i;

/** The first sentence of the answer that says something, without the "Sure, let me check" or "I've highlighted". */
export function summarise(answer: string) {
  for (const raw of answer.split(/(?<=[.?!।])\s+/)) {
    let s = raw.trim();
    const words = s.split(/\s+/).length;
    if (words <= 7 && ACKNOWLEDGEMENT.test(s)) continue;
    if (s.endsWith('?')) continue;
    if (/highlight|हाईलाइट/i.test(s)) {
      const rest = s.match(HIGHLIGHT_LEAD)?.[1];
      if (!rest) continue;
      s = rest.charAt(0).toUpperCase() + rest.slice(1);
    }
    if (s.split(/\s+/).length < 5) continue;
    return s.length > 220 ? `${s.slice(0, 217)}…` : s;
  }
  return '';
}

/**
 * @param answer   what the assistant has said so far this turn
 * @param results  clauses search_policy returned this turn
 * @param index    the whole policy, for a clause number said without a search
 * @param final    the turn is over; otherwise only take a clear signal, since
 *                 the answer is still arriving
 * @param queries  what the model searched for; it is in the policy's own
 *                 language, which helps when the answer is in Hindi or Tamil
 */
export function impliedCitation(
  answer: string,
  results: PolicyChunk[],
  index: PolicyIndex | undefined,
  final: boolean,
  queries = '',
): ImpliedCitation | null {
  if (answer.trim().length < 20) return null;
  const said = `${answer} ${queries}`;

  let chunk = mentioned(answer, results);

  // "clause 3.6" said out loud, answered from the full text without a search.
  if (!chunk && index) {
    const named = answer.match(/(?:clause|section|क्लॉज़|क्लॉज|खंड)\s*(\d{1,2}[\s.]+\d{1,3}|excl\w*\s*\d{1,3})/i);
    if (named) {
      const ref = named[1].replace(/^excl\w*\s*(\d+)$/i, 'Excl$1').replace(/^(\d{1,2})[\s.]+(\d{1,3})$/, '$1.$2');
      const matches = index.byRef(ref);
      if (matches.length === 1) chunk = matches[0];
    }
  }

  // No number said: while the answer is still coming, only take a search
  // result it clearly draws on. Once the turn is over, an answer given right
  // after a search came from those clauses, so pin the best match.
  if (!chunk && index && results.length && (final || tokenize(answer).length >= 12)) {
    const [top, second] = index.rank(said, results);
    const clearLead = top.score >= 8 && (!second || top.score >= second.score * 1.25);
    if (clearLead || (final && top.score >= 4)) chunk = top.chunk;
  }

  if (!chunk) return null;
  return { chunk, quote: bestSentence(chunk, said), meaning: summarise(answer) };
}
