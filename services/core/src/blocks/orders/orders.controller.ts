import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CreateOrderInput, type CurrentUser as CurrentUserT } from '@papperdash/contracts';
import { ZodPipe } from '../../platform/validation.js';
import { CurrentUser, Roles, RolesGuard, SessionGuard } from '../identity/index.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserT, @Body(new ZodPipe(CreateOrderInput)) body: CreateOrderInput) {
    return this.orders.create(user, body);
  }

  @Get()
  async list(@CurrentUser() user: CurrentUserT) {
    return { orders: await this.orders.listForCustomer(user.id) };
  }

  @Get(':id')
  get(@CurrentUser() user: CurrentUserT, @Param('id') id: string) {
    return this.orders.getForUser(user, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: CurrentUserT, @Param('id') id: string) {
    return this.orders.cancelByCustomer(user, id);
  }

  /** Support and admin: full state history for investigating an order. */
  @Get(':id/history')
  @UseGuards(RolesGuard)
  @Roles('support', 'admin')
  async history(@Param('id') id: string) {
    return { history: await this.orders.history(id) };
  }
}
