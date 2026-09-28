import { MissingKeyError } from './gemini.js';

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

/**
 * Browsers always send Sec-Fetch-Site, so this cheaply stops other websites
 * from minting tokens against our key. It is not auth, just a sensible fence.
 */
export function isCrossSite(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  return site !== null && site !== 'same-origin' && site !== 'none';
}

export async function readJson<T>(request: Request, maxBytes = 200_000): Promise<T | null> {
  const text = await request.text();
  if (!text || text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Turn SDK / network errors into something the UI can show a person. */
export function errorResponse(err: unknown) {
  if (err instanceof MissingKeyError) {
    return json({ error: 'missing_key', message: 'The server has no Gemini API key configured.' }, 500);
  }

  const message = err instanceof Error ? err.message : String(err);
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 0;

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return json({ error: 'rate_limited', message: 'Gemini free-tier limit reached. Give it a minute and try again.' }, 429);
  }
  if (status === 400 || status === 403 || /API key/i.test(message)) {
    return json({ error: 'upstream_rejected', message: 'Gemini rejected the request. Check the API key and model access.' }, 502);
  }

  console.error('[api] unexpected error', err);
  return json({ error: 'upstream_error', message: 'Could not reach Gemini right now.' }, 502);
}
