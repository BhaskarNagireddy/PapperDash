-- Launch price list for Sweden (client decision 2026-09-27). Prices in öre, VAT (25 %) included.
-- The tier is chosen by printed pages (pages x copies) and prices the whole order.
-- Colour uses the black-and-white tiers and delivery is free until the client sets them in admin.
-- Later changes are made in the admin console, which appends a new row; this seed is never edited.
INSERT INTO "pricing"."price_lists"
  ("id", "market", "currency", "vat_rate_bp", "max_pages", "max_file_mb", "bw_tiers", "colour_tiers", "delivery_fee_minor", "active_from", "created_by", "created_at")
VALUES (
  'prl_seed_se_launch', 'SE', 'SEK', 2500, 50, 50,
  '[{"fromPages":1,"toPages":5,"priceMinor":1000},{"fromPages":6,"toPages":15,"priceMinor":1600},{"fromPages":16,"toPages":25,"priceMinor":2500},{"fromPages":26,"toPages":50,"priceMinor":5000}]',
  '[{"fromPages":1,"toPages":5,"priceMinor":1000},{"fromPages":6,"toPages":15,"priceMinor":1600},{"fromPages":16,"toPages":25,"priceMinor":2500},{"fromPages":26,"toPages":50,"priceMinor":5000}]',
  0, '2026-01-01T00:00:00Z', 'seed', '2026-09-27T00:00:00Z'
);
