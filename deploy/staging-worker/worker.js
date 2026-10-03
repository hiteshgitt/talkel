/**
 * Permanent staging address (talkel-staging.<subdomain>.workers.dev): /v1/* → the API, everything
 * else → the web app. The origins are plain-text bindings (API_ORIGIN, WEB_ORIGIN) set by deploy.sh.
 * A cron trigger pings the API every 10 minutes so a free host that sleeps when idle (Render) stays awake.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const api = url.pathname === '/v1' || url.pathname.startsWith('/v1/');
    const target = new URL(url.pathname + url.search, api ? env.API_ORIGIN : env.WEB_ORIGIN);
    const headers = new Headers(request.headers);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', 'https');
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) headers.set('x-talkel-client-ip', ip);
    return fetch(target, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(fetch(new URL('/v1/health', env.API_ORIGIN)).catch(() => undefined));
  },
};
