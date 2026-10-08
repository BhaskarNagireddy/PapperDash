import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
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
  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] });
  app.enableShutdownHooks();
  return app;
}
