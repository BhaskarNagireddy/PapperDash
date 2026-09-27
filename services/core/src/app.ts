import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import type { PlatformOptions } from './platform/platform.module.js';

/** Builds the HTTP app. Shared by main.ts and the end-to-end tests. */
export async function createApp(platform: PlatformOptions): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(platform), { logger: ['error', 'warn', 'log'] });
  app.set('trust proxy', 1); // behind the AWS load balancer
  app.use(cookieParser());
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableShutdownHooks();
  return app;
}
