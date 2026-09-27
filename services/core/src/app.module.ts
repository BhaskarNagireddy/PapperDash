import { Controller, DynamicModule, Get, Module } from '@nestjs/common';
import { IdentityModule } from './blocks/identity/index.js';
import { OrdersModule } from './blocks/orders/index.js';
import { PlatformModule, type PlatformOptions } from './platform/platform.module.js';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok' };
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
      imports: [PlatformModule.forRoot(platform), IdentityModule, OrdersModule],
      controllers: [HealthController],
    };
  }
}
