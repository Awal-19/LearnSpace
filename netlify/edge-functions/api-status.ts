import type { Config, Context } from '@netlify/edge-functions';

export default async function handler(request: Request, context: Context): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'GET') {
    return Response.json(
      { error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET for this endpoint' } },
      { status: 405 },
    );
  }

  return Response.json(
    {
      ok: true,
      service: 'learnspace-edge',
      timestamp: new Date().toISOString(),
      geo: {
        country: context.geo.country?.code ?? null,
        city: context.geo.city ?? null,
      },
      requestId: context.requestId,
    },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
      },
    },
  );
}

export const config: Config = {
  path: '/api/edge/status',
};

