import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { UpsertStationInput } from '@papperdash/contracts';
import { ZodPipe } from '../../platform/validation.js';
import { Roles, RolesGuard, SessionGuard } from '../identity/index.js';
import { StationsService } from './stations.service.js';

/** Public: the website lists open stations before sign-in. */
@Controller('stations')
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @Get()
  async list() {
    return { stations: await this.stations.listActive() };
  }
}

@Controller('admin/stations')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class StationsAdminController {
  constructor(private readonly stations: StationsService) {}

  @Put(':id')
  upsert(@Param('id') id: string, @Body(new ZodPipe(UpsertStationInput)) body: UpsertStationInput) {
    return this.stations.upsert(id, body);
  }
}
