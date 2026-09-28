import { GoogleGenAI } from '@google/genai';

export const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.1-flash-live-preview';
export const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-3-flash-preview';
export const TEXT_FALLBACK_MODELS = (process.env.GEMINI_TEXT_FALLBACKS || 'gemini-3.1-flash-lite,gemini-flash-latest')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
export const VOICE = process.env.GEMINI_VOICE || 'Kore';

export class MissingKeyError extends Error {
  constructor() {
    super('GEMINI_API_KEY is not set on the server.');
  }
}

/**
 * Ephemeral tokens are still a v1alpha feature in the SDK, so the Live client
 * uses that API version. Plain text generation stays on the default.
 */
export function createClient(opts: { alpha?: boolean } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new MissingKeyError();
  return new GoogleGenAI({
    apiKey,
    ...(opts.alpha ? { httpOptions: { apiVersion: 'v1alpha' } } : {}),
  });
}
