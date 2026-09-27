import { DynamicModule, Global, Module } from '@nestjs/common';
import type { EmailProvider } from '@papperdash/contracts';
import { Clock, SystemClock } from './clock.js';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DB, type Db } from './database.js';
import { EMAIL_PROVIDER, LogEmailProvider } from './email.js';
import { EventBus, Outbox } from './events.js';

export interface PlatformOptions {
  db: Db;
  config: AppConfig;
  clock?: Clock;
  email?: EmailProvider;
}

/** Infrastructure every block may use: database, clock, outbox, event bus, email port. */
@Global()
@Module({})
export class PlatformModule {
  static forRoot(opts: PlatformOptions): DynamicModule {
    return {
      module: PlatformModule,
      providers: [
        { provide: DB, useValue: opts.db },
        { provide: APP_CONFIG, useValue: opts.config },
        { provide: Clock, useValue: opts.clock ?? new SystemClock() },
        { provide: EMAIL_PROVIDER, useValue: opts.email ?? new LogEmailProvider() },
        Outbox,
        EventBus,
      ],
      exports: [DB, APP_CONFIG, Clock, EMAIL_PROVIDER, Outbox, EventBus],
    };
  }
}
