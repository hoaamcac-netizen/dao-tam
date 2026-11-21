/**
 * Cloudflare Pages Function Proxy for /api/* -> CloudFly Audio Backend
 * Chạy hoàn toàn miễn phí trên Cloudflare Pages (100.000 request/ngày),
 * giúp https://truyen-doc-va-nghe-dao-tam.pages.dev/api/tts gọi về CloudFly qua HTTPS
 * mà không bị lỗi Mixed Content hay CORS, đồng thời tận dụng Cloudflare Edge Cache cho GET MP3.
 *
 * Cấu hình trong Cloudflare Pages -> Settings -> Environment Variables:
 *   TTS_BACKEND_URL = https://tts.tenmiencuaban.com (hoặc https://103-166-185-160.sslip.io / https://xxx.trycloudflare.com)
 */

interface PagesFunctionEnv {
  TTS_BACKEND_URL?: string;
}

interface PagesFunctionContext {
  request: Request;
  env: PagesFunctionEnv;
}

const ALLOWED_TTS_PATHS = ['/api/tts', '/api/tts/stream', '/api/tts/voices', '/api/tts/health'];
const DEFAULT_TTS_BACKEND_URL = 'https://103-166-185-160.sslip.io';

function isRawIpHostname(hostname: string): boolean {
  const clean = hostname.replace(/^\[|\]$/g, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(clean)) return true;
  if (clean.includes(':')) return true;
  return false;
}

function buildCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', origin || '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return headers;
}

export const onRequest = async (context: PagesFunctionContext): Promise<Response> => {
  const { request, env } = context;
  const reqUrl = new URL(request.url);
  const origin = request.headers.get('Origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
  }

  if (!ALLOWED_TTS_PATHS.includes(reqUrl.pathname)) {
    return new Response(
      JSON.stringify({ error: 'API endpoint not proxied by Cloudflare Pages Function' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }

  const rawBackend = String(env.TTS_BACKEND_URL || DEFAULT_TTS_BACKEND_URL)
    .trim()
    .replace(/\/+$/, '');

  let targetUrl: URL;
  try {
    targetUrl = new URL(`${reqUrl.pathname}${reqUrl.search}`, rawBackend);
  } catch {
    return new Response(
      JSON.stringify({ error: 'TTS_BACKEND_URL không hợp lệ.' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }

  // Cloudflare Workers chặn fetch trực tiếp bằng IP trần (lỗi 1003) -> cảnh báo rõ ràng
  if (isRawIpHostname(targetUrl.hostname)) {
    return new Response(
      JSON.stringify({
        error:
          'Cloudflare không cho phép proxy tới địa chỉ IP trần. Hãy dùng tên miền (VD: https://tts.tenmiencuaban.com hoặc https://103-166-185-160.sslip.io).',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    );
  }

  const isCacheableGetAudio =
    request.method === 'GET' &&
    (reqUrl.pathname === '/api/tts' || reqUrl.pathname === '/api/tts/stream') &&
    reqUrl.searchParams.has('text');

  const cacheStorage = (globalThis as any).caches?.default as Cache | undefined;
  const cacheKey = isCacheableGetAudio ? new Request(reqUrl.toString(), { method: 'GET' }) : null;

  if (cacheStorage && cacheKey) {
    try {
      const cachedRes = await cacheStorage.match(cacheKey);
      if (cachedRes) {
        const hitHeaders = new Headers(cachedRes.headers);
        hitHeaders.set('Access-Control-Allow-Origin', origin || '*');
        hitHeaders.set('X-DaoTam-Cache', 'CF-EDGE-HIT');
        return new Response(cachedRes.body, {
          status: cachedRes.status,
          headers: hitHeaders,
        });
      }
    } catch {}
  }

  try {
    const forwardHeaders = new Headers();
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
      forwardHeaders.set('Content-Type', contentType);
    }

    const upstreamRes = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: forwardHeaders,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });

    const respHeaders = new Headers(upstreamRes.headers);
    respHeaders.set('Access-Control-Allow-Origin', origin || '*');
    respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    respHeaders.set('Access-Control-Allow-Headers', 'Content-Type');

    if (
      isCacheableGetAudio &&
      upstreamRes.ok &&
      (respHeaders.get('Content-Type') || '').includes('audio') &&
      cacheStorage &&
      cacheKey
    ) {
      const clonedForCache = upstreamRes.clone();
      const cacheHeaders = new Headers(clonedForCache.headers);
      if (!cacheHeaders.has('Cache-Control')) {
        cacheHeaders.set('Cache-Control', 'public, max-age=2592000');
      }
      const cacheableResponse = new Response(clonedForCache.body, {
        status: clonedForCache.status,
        headers: cacheHeaders,
      });
      cacheStorage.put(cacheKey, cacheableResponse).catch(() => {});
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: respHeaders,
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: `Không kết nối được tới máy chủ Audio CloudFly: ${err?.message || 'Unknown error'}`,
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': origin || '*',
        },
      }
    );
  }
};
