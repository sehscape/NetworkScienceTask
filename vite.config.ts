import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

/**
 * On Vercel, every file in /api becomes a serverless function. Locally we don't
 * want to depend on the Vercel CLI, so this plugin mounts the same handlers on
 * the Vite dev server. Handlers use the Web `Request`/`Response` signature,
 * which means the code path is identical in both places.
 */
function localApi(): Plugin {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        handleApi(server, req, res).catch(next);
      });
    },
  };
}

async function handleApi(server: ViteDevServer, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const route = url.pathname.replace(/^\/api\//, '');

  if (!/^[a-z-]+$/.test(route)) {
    res.statusCode = 404;
    return res.end();
  }

  let mod: Record<string, unknown>;
  try {
    mod = await server.ssrLoadModule(`/api/${route}.ts`);
  } catch {
    res.statusCode = 404;
    return res.end();
  }

  const handler = mod[req.method ?? 'GET'];
  if (typeof handler !== 'function') {
    res.statusCode = 405;
    return res.end();
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });

  const response: Response = await handler(request);
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export default defineConfig(({ mode }) => {
  // Make .env values (GEMINI_API_KEY etc.) visible to the /api handlers in dev.
  // Nothing without a VITE_ prefix is ever exposed to the client bundle.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));

  return {
    plugins: [react(), localApi()],
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          policy: fileURLToPath(new URL('./policy.html', import.meta.url)),
        },
      },
    },
  };
});
