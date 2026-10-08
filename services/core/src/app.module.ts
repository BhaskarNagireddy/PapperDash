import { Controller, DynamicModule, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DocumentsModule } from './blocks/documents/index.js';
import { IdentityModule } from './blocks/identity/index.js';
import { OrdersModule } from './blocks/orders/index.js';
import { PaymentsModule } from './blocks/payments/index.js';
import { PricingModule } from './blocks/pricing/index.js';
import { DB, type Db } from './platform/database.js';
import { PlatformModule, type PlatformOptions } from './platform/platform.module.js';

/**
 * `/health`: the process is alive (container restarts if not).
 * `/health/ready`: it can also reach the database, so the load balancer may send it traffic.
 */
@Controller('health')
class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready() {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({ status: 'database_unreachable' });
    }
  }
}

/**
 * Composition root. Each block is one module; adding a block is one line here.
 * A block extracted into its own service is removed from this list and reached over the network instead.
 */
@Module({})
export class AppModule {
  static forRoot(platform: PlatformOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [PlatformModule.forRoot(platform), IdentityModule, PricingModule, DocumentsModule, OrdersModule, PaymentsModule],
      controllers: [HealthController],
    };
  }
}
