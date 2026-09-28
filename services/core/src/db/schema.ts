// Migration registry: every block's tables, each in its own Postgres schema.
// Application code never imports this file; blocks only touch their own schema.
export * from '../platform/platform.schema.js';
export * from '../blocks/identity/identity.schema.js';
export * from '../blocks/orders/orders.schema.js';
export * from '../blocks/pricing/pricing.schema.js';
export * from '../blocks/documents/documents.schema.js';
export * from '../blocks/payments/payments.schema.js';
