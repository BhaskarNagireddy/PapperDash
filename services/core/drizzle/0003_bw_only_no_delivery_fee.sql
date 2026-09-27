ALTER TABLE "pricing"."price_lists" ALTER COLUMN "colour_tiers" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pricing"."price_lists" DROP COLUMN "delivery_fee_minor";--> statement-breakpoint
-- Client decision 2026-09-27: the prototype prints black and white only, and delivery is priced by the
-- delivery partner. Publishes a new SE price list (append-only) with the same tiers and colour switched off.
INSERT INTO "pricing"."price_lists"
  ("id", "market", "currency", "vat_rate_bp", "max_pages", "max_file_mb", "bw_tiers", "colour_tiers", "active_from", "created_by", "created_at")
VALUES (
  'prl_seed_se_bw_only', 'SE', 'SEK', 2500, 50, 50,
  '[{"fromPages":1,"toPages":5,"priceMinor":1000},{"fromPages":6,"toPages":15,"priceMinor":1600},{"fromPages":16,"toPages":25,"priceMinor":2500},{"fromPages":26,"toPages":50,"priceMinor":5000}]',
  NULL, '2026-09-27T00:00:00Z', 'seed', '2026-09-27T00:00:00Z'
);
