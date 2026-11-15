import {
  handleInsightsRequest,
  handleThemesRequest,
  verifyBearerHeader,
} from '../../server/apiCore.ts';

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = url.pathname
    .replace(/^\/\.netlify\/functions\/api/, '')
    .replace(/^\/api/, '');

  if (req.method === 'GET' && (route === '/health' || route === '' || route === '/')) {
    return jsonResponse(200, { status: 'ok', service: 'data-detectives', runtime: 'netlify' });
  }

  if (req.method === 'POST' && (route === '/insights' || route === '/themes')) {
    const auth = await verifyBearerHeader(req.headers.get('authorization'));
    if (!auth.ok) {
      return jsonResponse(auth.status, { error: auth.error });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON request body' });
    }

    const result =
      route === '/insights'
        ? await handleInsightsRequest(payload)
        : await handleThemesRequest(payload);
    return jsonResponse(result.status, result.body);
  }

  return jsonResponse(404, { error: `Unknown API route: ${url.pathname}` });
}

export const config = {
  path: '/api/*',
};
