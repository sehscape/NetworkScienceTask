import { ThinkingLevel } from '@google/genai';
import type { CallReport, ReportRequest } from '../shared/types.js';
import { createClient, TEXT_FALLBACK_MODELS, TEXT_MODEL } from './_lib/gemini.js';
import { errorResponse, isCrossSite, json, readJson } from './_lib/http.js';

/**
 * POST /api/report
 *
 * Turn-based step after the live call: gemini-3-flash-preview (with lighter
 * fallbacks when its free-tier quota runs out) reads the
 * transcript plus everything the live model recorded through tools, and writes
 * a structured hand-off note for the claims desk.
 *
 * Numbers and quotes are NOT regenerated here. The payout breakdown and the
 * verbatim clause quotes come straight from the call state; this model only
 * writes the narrative around them.
 */

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short case title, e.g. "Health claim: dengue admission at Lilavati, 3 days".' },
    intent: { type: 'string', enum: ['new_claim', 'policy_question', 'claim_follow_up', 'other'] },
    summary: { type: 'string', description: 'Three to four sentences for a claims officer picking this up cold.' },
    caller_sentiment: { type: 'string', enum: ['calm', 'worried', 'frustrated', 'confused', 'unknown'] },
    coverage_explanation: { type: 'string', description: 'Two sentences on the coverage position and what it hinges on.' },
    clause_notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          why_it_matters: { type: 'string' },
        },
        required: ['ref', 'why_it_matters'],
      },
    },
    open_questions: { type: 'array', items: { type: 'string' }, description: 'What is still unknown or unverified.' },
    next_steps: { type: 'array', items: { type: 'string' } },
    documents: { type: 'array', items: { type: 'string' } },
    flags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Anything the claims desk should double-check: late intimation, waiting periods, mismatched details, and so on.',
    },
  },
  required: [
    'title',
    'intent',
    'summary',
    'caller_sentiment',
    'coverage_explanation',
    'clause_notes',
    'open_questions',
    'next_steps',
    'documents',
    'flags',
  ],
};

const INSTRUCTIONS = `You write hand-off notes for an Indian insurance claims desk.
You receive the transcript of a live voice call between a policyholder and a voice assistant, plus structured data the assistant captured during the call.
Rules:
- Use only facts present in the input. If something is unknown, list it under open_questions instead of guessing.
- Clause references must come from the citations provided. Do not invent clause numbers.
- Do not restate or recompute rupee amounts beyond what the payout data says.
- Write in clear, neutral English even if the call was in another language.
- Never include Aadhaar, PAN, bank or card numbers even if they appear in the transcript.`;

function validate(body: ReportRequest | null): body is ReportRequest {
  return !!body && Array.isArray(body.transcript) && typeof body.claim === 'object' && Array.isArray(body.citations);
}

export async function POST(request: Request) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);

  const body = await readJson<ReportRequest>(request);
  if (!validate(body)) return json({ error: 'bad_request' }, 400);

  // Long calls: keep the most recent part of the conversation, it carries the conclusions.
  const transcript = body.transcript
    .filter((line) => line && typeof line.text === 'string' && line.text.trim())
    .slice(-120)
    .map((line) => `${line.speaker === 'caller' ? 'Caller' : 'Assistant'}: ${line.text.trim()}`)
    .join('\n');

  const context = {
    call_duration_seconds: body.durationSeconds,
    claim_file: body.claim,
    citations: body.citations,
    coverage: body.coverage ?? null,
    payout_estimate: body.payout ?? null,
    next_steps: body.nextSteps ?? null,
  };

  let ai;
  try {
    ai = createClient();
  } catch (err) {
    return errorResponse(err);
  }

  const prompt = `CALL DATA\n${JSON.stringify(context, null, 2)}\n\nTRANSCRIPT\n${transcript || '(empty)'}`;
  let lastError: unknown;

  for (const model of [TEXT_MODEL, ...TEXT_FALLBACK_MODELS]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: INSTRUCTIONS,
          responseMimeType: 'application/json',
          responseJsonSchema: REPORT_SCHEMA,
          ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
        },
      });

      const report = JSON.parse(response.text ?? '') as CallReport;
      return json({ report, model });
    } catch (err) {
      lastError = err;
      if (!shouldFallBack(err)) break;
      console.warn(`[report] ${model} unavailable, trying the next model`);
    }
  }

  return errorResponse(lastError);
}

/**
 * The free tier allows only a handful of requests per day per model, and
 * preview models get "high demand" 503s. Each model has its own quota, so
 * moving down the list keeps the hand-off note working.
 */
function shouldFallBack(err: unknown) {
  if (err instanceof SyntaxError) return true; // malformed JSON, another model may do better
  const status = (err as { status?: unknown })?.status;
  return status === 429 || status === 500 || status === 503 || status === 404;
}
