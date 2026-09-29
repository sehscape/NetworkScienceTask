import type { PolicyDigest } from '../../shared/types';
import { fullText } from './load';
import { normalise } from './search';
import type { PolicyChunk, PolicyDocument } from './types';

/**
 * "Policy at a glance": the key numbers and the clauses that most often
 * shrink a claim, pulled out by Gemini once per policy and linked back to
 * the clauses they come from.
 */

export interface GlanceFact {
  label: string;
  value: string;
  chunk: PolicyChunk;
  /** The value appears word for word in that clause. */
  verified: boolean;
}

export interface GlanceWatchOut {
  title: string;
  detail: string;
  chunk: PolicyChunk;
}

export interface Glance {
  product: string;
  oneLiner: string;
  facts: GlanceFact[];
  watchOuts: GlanceWatchOut[];
}

const CACHE_PREFIX = 'covered:glance:v1:';

// One request per loaded document, shared by every component that shows it.
const requests = new Map<string, Promise<Glance>>();

export function loadGlance(doc: PolicyDocument) {
  let request = requests.get(doc.id);
  if (!request) {
    request = fetchGlance(doc);
    requests.set(doc.id, request);
    request.catch(() => requests.delete(doc.id));
  }
  return request;
}

async function fetchGlance(doc: PolicyDocument): Promise<Glance> {
  const text = fullText(doc.chunks);
  const key = CACHE_PREFIX + fingerprint(text);

  let digest = readCache(key);
  if (!digest) {
    digest = await requestDigest(doc.name, text);
    writeCache(key, digest);
  }
  return link(digest, doc.chunks);
}

/** Free-tier models are sometimes briefly overloaded, so a server error gets one more try. */
async function requestDigest(name: string, text: string, retries = 1): Promise<PolicyDigest> {
  const res = await fetch('/api/digest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.digest) return body.digest as PolicyDigest;
  if (res.status >= 500 && retries > 0) {
    await new Promise((r) => setTimeout(r, 4000));
    return requestDigest(name, text, retries - 1);
  }
  throw new Error(body.message ?? 'Could not summarise this policy.');
}

/** Keeps only items that point at a clause that really exists in this document. */
function link(digest: PolicyDigest, chunks: PolicyChunk[]): Glance {
  const byId = new Map(chunks.map((c) => [c.id.toUpperCase(), c]));
  const find = (id: string) => byId.get(String(id ?? '').trim().toUpperCase());

  const facts = (digest.key_facts ?? []).flatMap((f) => {
    const chunk = find(f.clause_id);
    if (!chunk || !f.label || !f.value) return [];
    const verified = normalise(chunk.text).includes(normalise(f.value));
    return [{ label: f.label, value: f.value, chunk, verified }];
  });

  const watchOuts = (digest.watch_outs ?? []).flatMap((w) => {
    const chunk = find(w.clause_id);
    return chunk && w.title ? [{ title: w.title, detail: w.detail, chunk }] : [];
  });

  return { product: digest.product, oneLiner: digest.one_liner, facts: facts.slice(0, 8), watchOuts: watchOuts.slice(0, 5) };
}

/** FNV-1a: a cheap, stable key so the same policy isn't summarised twice. */
function fingerprint(text: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}${text.length.toString(36)}`;
}

function readCache(key: string): PolicyDigest | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PolicyDigest) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, digest: PolicyDigest) {
  try {
    localStorage.setItem(key, JSON.stringify(digest));
  } catch {
    // Storage full or blocked; the summary just won't be remembered.
  }
}
