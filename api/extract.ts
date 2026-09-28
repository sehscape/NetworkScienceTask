import { ThinkingLevel } from '@google/genai';
import { createClient, EXTRACT_MODELS } from './_lib/gemini.js';
import { firstSuccessful } from './_lib/hedge.js';
import { errorResponse, isCrossSite, json, readJson } from './_lib/http.js';

/**
 * POST /api/extract
 *
 * Reads the text off photographed or scanned policy pages, so they can be
 * given to the live assistant in full. The browser sends a few pages at a
 * time (Vercel caps request bodies at 4.5 MB).
 *
 * Body: { images: [{ data: base64, mimeType }] }  ->  { pages: string[] }
 */

const MAX_IMAGES = 6;
const MAX_IMAGE_CHARS = 1_500_000;

const SCHEMA = {
  type: 'object',
  properties: {
    pages: {
      type: 'array',
      description: 'One entry per image, in the order given.',
      items: { type: 'string' },
    },
  },
  required: ['pages'],
};

const INSTRUCTIONS = `You transcribe pages of insurance policy documents.
For each image, return all readable text on that page, in reading order.
Keep clause and section numbers exactly as printed (e.g. "3.6", "Section II(b)"), keep headings on their own lines, and keep table rows on one line each with cells separated by " | ".
Do not summarise, translate or correct anything. If a page is blank or unreadable, return an empty string for it.`;

interface Body {
  images?: { data?: unknown; mimeType?: unknown }[];
}

export async function POST(request: Request) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);

  const body = await readJson<Body>(request, 4_400_000);
  const images = (body?.images ?? []).filter(
    (img): img is { data: string; mimeType: string } =>
      typeof img?.data === 'string' &&
      img.data.length < MAX_IMAGE_CHARS &&
      typeof img.mimeType === 'string' &&
      /^image\/(jpeg|png|webp)$/.test(img.mimeType),
  );
  if (!images.length || images.length > MAX_IMAGES) return json({ error: 'bad_request' }, 400);

  let ai;
  try {
    ai = createClient();
  } catch (err) {
    return errorResponse(err);
  }

  try {
    const { value: pages, model } = await firstSuccessful(
      EXTRACT_MODELS,
      async (model, signal) => {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                ...images.map((img) => ({ inlineData: { data: img.data, mimeType: img.mimeType } })),
                { text: `Transcribe these ${images.length} page(s).` },
              ],
            },
          ],
          config: {
            systemInstruction: INSTRUCTIONS,
            responseMimeType: 'application/json',
            responseJsonSchema: SCHEMA,
            abortSignal: signal,
            ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } } : {}),
          },
        });
        const parsed = JSON.parse(response.text ?? '') as { pages?: unknown[] };
        return images.map((_, i) => String(parsed.pages?.[i] ?? ''));
      },
      { hedgeAfterMs: 8_000, timeoutMs: 30_000 },
    );
    return json({ pages, model });
  } catch (err) {
    return errorResponse(err);
  }
}
