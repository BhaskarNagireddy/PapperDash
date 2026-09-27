import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/index.js';
import { PricingAdminController, PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [PricingController, PricingAdminController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
