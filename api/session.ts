import { createClient, LIVE_MODEL } from './_lib/gemini.js';
import { buildLiveConfig, MAX_POLICY_CHARS, type PolicyContext } from './_lib/live-config.js';
import { errorResponse, isCrossSite, json, readJson } from './_lib/http.js';

/**
 * POST /api/session
 *
 * Mints a short-lived, single-use Live API token. The browser opens the
 * WebSocket to Gemini directly with it (serverless functions can't hold a
 * socket open), and the real API key never leaves the server.
 *
 * Body (all optional):
 *   resumeHandle  continue a session after the server recycles the connection
 *   policy        { name, text, mode } of a policy the caller loaded before
 *                 the call; it goes into the locked system prompt. mode is
 *                 'outline' for long policies the model searches instead.
 */
interface Body {
  resumeHandle?: unknown;
  policy?: { name?: unknown; text?: unknown; mode?: unknown };
}

export async function POST(request: Request) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);

  const body = (await readJson<Body>(request, 400_000)) ?? {};
  const resumeHandle =
    typeof body.resumeHandle === 'string' && body.resumeHandle.length < 2048 ? body.resumeHandle : undefined;

  let policy: PolicyContext | undefined;
  if (body.policy && typeof body.policy.text === 'string' && body.policy.text.trim()) {
    if (body.policy.text.length > MAX_POLICY_CHARS) return json({ error: 'policy_too_long' }, 413);
    policy = {
      name: String(body.policy.name ?? 'Policy document').slice(0, 120).replace(/["<>]/g, ''),
      // A document can't close the policy tags early and talk to the model as "the system".
      text: body.policy.text.replace(/<\/?policy>/gi, ''),
      mode: body.policy.mode === 'outline' ? 'outline' : 'full',
    };
  }

  try {
    const ai = createClient({ alpha: true });
    const now = Date.now();

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        // The session itself may run for up to 30 minutes on this token...
        expireTime: new Date(now + 30 * 60_000).toISOString(),
        // ...but it has to be opened within the next minute.
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        liveConnectConstraints: {
          model: LIVE_MODEL,
          config: buildLiveConfig({ resumeHandle, policy }),
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    });

    if (!token.name) throw new Error('Token response had no name');

    return json({ token: token.name, model: LIVE_MODEL });
  } catch (err) {
    return errorResponse(err);
  }
}
