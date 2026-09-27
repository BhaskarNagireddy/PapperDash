import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { MARKETS, PriceListInput, QuoteInput, type CurrentUser as CurrentUserT, type Market } from '@papperdash/contracts';
import { ZodPipe } from '../../platform/validation.js';
import { CurrentUser, Roles, RolesGuard, SessionGuard } from '../identity/index.js';
import { PricingService } from './pricing.service.js';

const MarketPipe = new ParseEnumPipe(Object.fromEntries(MARKETS.map((m) => [m, m])));

/** Public: apps show the price table and live quotes before sign-in. */
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  current(@Query('market', new ParseEnumPipe(Object.fromEntries(MARKETS.map((m) => [m, m])), { optional: true })) market?: Market) {
    return this.pricing.active(market ?? 'SE');
  }

  @Post('quote')
  @HttpCode(200)
  quote(@Body(new ZodPipe(QuoteInput)) body: QuoteInput) {
    return this.pricing.quote(body);
  }
}

@Controller('admin/pricing')
@UseGuards(SessionGuard, RolesGuard)
@Roles('admin')
export class PricingAdminController {
  constructor(private readonly pricing: PricingService) {}

  @Put(':market')
  publish(@Param('market', MarketPipe) market: Market, @Body(new ZodPipe(PriceListInput)) body: PriceListInput, @CurrentUser() user: CurrentUserT) {
    return this.pricing.publish(market, body, user.id);
  }

  @Get(':market/history')
  async history(@Param('market', MarketPipe) market: Market) {
    return { priceLists: await this.pricing.history(market) };
  }
}
