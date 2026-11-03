import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/index.js';
import { IdentityModule } from '../identity/index.js';
import { PricingModule } from '../pricing/index.js';
import { StationsModule } from '../stations/index.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [IdentityModule, DocumentsModule, PricingModule, StationsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
