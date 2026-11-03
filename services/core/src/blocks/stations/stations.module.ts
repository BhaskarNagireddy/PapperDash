import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/index.js';
import { StationsAdminController, StationsController } from './stations.controller.js';
import { StationsService } from './stations.service.js';

@Module({
  imports: [IdentityModule],
  controllers: [StationsController, StationsAdminController],
  providers: [StationsService],
  exports: [StationsService],
})
export class StationsModule {}
