import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './platform/config.js';
import type { PlatformOptions } from './platform/platform.module.js';

/** Builds the HTTP app. Shared by main.ts and the end-to-end tests. */
export async function createApp(platform: PlatformOptions): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(platform), {
    logger: ['error', 'warn', 'log'],
    // Keeps the exact request bytes for payment webhook signature checks.
    rawBody: true,
  });
  return configureApp(app);
}

/** HTTP settings shared by production and tests. */
export function configureApp(app: NestExpressApplication): NestExpressApplication {
  app.set('trust proxy', 1); // behind the AWS load balancer
  // Standard security headers (HSTS, nosniff, frame denial, no referrer leakage) and no X-Powered-By. The API only
  // returns JSON, so its content security policy allows nothing to load or embed it; the website sets its own CSP.
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
  app.use(cookieParser());
  // The website (papperdash.se) calls the API on its own origin (api.papperdash.se) with the session cookie, so
  // only the exact origins in CORS_ORIGINS may read responses with credentials. Requests without an Origin header
  // (the mobile apps, stations, Stripe webhooks, health checks) are not browser cross-origin calls and pass through.
  const { corsOrigins } = app.get<AppConfig>(APP_CONFIG);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || corsOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization'],
    maxAge: 600,
  });
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
  app.enableShutdownHooks();
  return app;
}
