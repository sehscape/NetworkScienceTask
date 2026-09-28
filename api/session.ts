import { createClient, LIVE_MODEL } from './_lib/gemini.js';
import { buildLiveConfig } from './_lib/live-config.js';
import { errorResponse, isCrossSite, json, readJson } from './_lib/http.js';

/**
 * POST /api/session
 *
 * Mints a short-lived, single-use Live API token. The browser opens the
 * WebSocket to Gemini directly with it (serverless functions can't hold a
 * socket open), and the real API key never leaves the server.
 *
 * Body (optional): { resumeHandle } to continue a session after the server
 * recycles the connection.
 */
export async function POST(request: Request) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);

  const body = (await readJson<{ resumeHandle?: unknown }>(request)) ?? {};
  const resumeHandle =
    typeof body.resumeHandle === 'string' && body.resumeHandle.length < 2048 ? body.resumeHandle : undefined;

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
          config: buildLiveConfig(resumeHandle),
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
