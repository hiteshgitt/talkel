import type { NextConfig } from 'next';

/**
 * The browser only ever talks to this origin: /v1/* is forwarded to the API, so auth cookies
 * are first-party and no CORS is needed.
 */
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4810';
const webHost = process.env.NEXT_PUBLIC_WEB_URL ? new URL(process.env.NEXT_PUBLIC_WEB_URL).hostname : undefined;

const nextConfig: NextConfig = {
  // Container builds (deploy/web.Dockerfile) ship the self-contained server.
  ...(process.env.NEXT_STANDALONE ? { output: 'standalone' as const } : {}),
  async rewrites() {
    return [{ source: '/v1/:path*', destination: `${apiInternalUrl}/v1/:path*` }];
  },
  // The dev server is opened from phones/laptops on the LAN by IP address.
  allowedDevOrigins: webHost ? [webHost] : [],
};

export default nextConfig;
