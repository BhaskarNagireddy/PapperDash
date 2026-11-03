import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

/** Where the core API runs. In production CloudFront serves both from papperdash.se, so this is only a fallback. */
const coreUrl = process.env.CORE_URL ?? 'http://localhost:4000';

/**
 * The document bucket's origin (https://<bucket>.s3.eu-north-1.amazonaws.com). Browsers upload files straight to
 * it with a presigned POST, so it must be allowed in connect-src. Unset in development and CI, where uploads go
 * to core's /v1/documents/dev-upload on our own origin.
 */
const uploadOrigin = process.env.UPLOAD_ORIGIN;
if (uploadOrigin && !/^https:\/\/[a-z0-9.-]+$/.test(uploadOrigin)) throw new Error('UPLOAD_ORIGIN must be an https origin with no path');

// Static pages cannot carry a per-request nonce, so scripts allow 'unsafe-inline' (the documented setting for
// statically rendered Next.js pages). Everything else is locked to our own origin; Stripe is added with checkout.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${uploadOrigin ? ` ${uploadOrigin}` : ''}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@papperdash/contracts', '@papperdash/design-tokens'],
  // One domain: the browser calls /v1/* on papperdash.se. In production CloudFront routes it to core before
  // it reaches Next.js; in development and tests this rewrite forwards it, so the session cookie is first-party.
  async rewrites() {
    return [{ source: '/v1/:path*', destination: `${coreUrl}/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]),
        ],
      },
    ];
  },
};

export default nextConfig;
