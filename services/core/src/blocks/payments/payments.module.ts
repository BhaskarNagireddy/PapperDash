import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../platform/config.js';
import { IdentityModule } from '../identity/index.js';
import { OrdersModule } from '../orders/index.js';
import { CheckoutController, RefundsController, WebhooksController } from './payments.controller.js';
import { PAYMENT_PROVIDER, PaymentsService } from './payments.service.js';
import { StripePaymentProvider } from './stripe.provider.js';

@Module({
  imports: [IdentityModule, OrdersModule],
  controllers: [CheckoutController, WebhooksController, RefundsController],
  providers: [
    PaymentsService,
    // No Stripe keys configured = payments switched off (checkout answers 503), e.g. in local development.
    { provide: PAYMENT_PROVIDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => (c.stripe ? new StripePaymentProvider(c.stripe) : null) },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
