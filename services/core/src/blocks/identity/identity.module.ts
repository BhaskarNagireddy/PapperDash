import { Module } from '@nestjs/common';
import { RolesGuard, SessionGuard, StationGuard } from './auth.guards.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { LoginThrottle } from './login-throttle.js';

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, LoginThrottle, SessionGuard, RolesGuard, StationGuard],
  exports: [IdentityService, SessionGuard, RolesGuard, StationGuard],
})
export class IdentityModule {}
