-- Staging Data: Sample data for testing
-- Run this AFTER staging_migration.sql

-- ============================================
-- CPT Site Accounts
-- ============================================
INSERT INTO "public"."cpt_site_accounts" ("site_id", "site_name", "cp_name", "account_identifier", "is_active", "created_at", "updated_at") VALUES
	('6070', 'MOHWK-STORE', 'MOHAWK', 'cpt_site_6070', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6079', 'Bravento', 'JR', 'cpt_site_6079', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6082', '15302781 Canada Inc.', 'BNDT', 'cpt_site_6082', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6080', 'Ventoro Group Limited - S', 'BioSupps', 'cpt_site_6080', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6083', 'Ventoro Group Limited - AW', 'PAYMENTPROS', 'cpt_site_6083', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6068', 'Stripe test 2', 'Test Merchant Finvaro', 'cpt_site_6068', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6076', 'bravento', 'Payroc', 'cpt_site_6076', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6073', 'APOnlinestore', 'Payroc', 'cpt_site_6073', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6074', 'msautomarket', 'Bravento LLP', 'cpt_site_6074', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6081', 'AP Online Store Inc.', 'NSC', 'cpt_site_6081', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6072', 'freshgoodszone - STRP', 'Payroc', 'cpt_site_6072', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6069', 'mowatchstore - STRP', 'MOHAWK', 'cpt_site_6069', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6051', 'Site 6051', 'Unknown', 'cpt_site_6051', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6052', 'Site 6052', 'Unknown', 'cpt_site_6052', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6084', 'Ventoro Group Limited - AW2', 'RX Site', 'cpt_site_6084', true, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6085', 'Riveting Stripe', 'Riveting', 'cpt_site_6085', false, '2026-01-13 16:42:46.216068+00', '2026-01-13 16:42:46.216068+00'),
	('6067', 'Test Stripe', 'Test Merchant digipay', 'cpt_site_6067', false, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00'),
	('6071', 'thesmart-choice.shop - sqaure', 'thesmart-choice.shop - digipay', 'cpt_site_6071', false, '2026-01-09 23:34:45.376321+00', '2026-01-09 23:34:45.376321+00')
ON CONFLICT (site_id) DO NOTHING;

-- ============================================
-- Site Pricing
-- ============================================
INSERT INTO "public"."site_pricing" ("id", "site_id", "site_name", "percentage_fee", "per_transaction_fee", "refund_fee", "chargeback_fee", "created_at", "updated_at", "notes", "daily_limit", "max_ticket_size", "gateway_status") VALUES
	('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '6070', 'MOHWK-STORE', 3.500, 0.30, 15.00, 25.00, now(), now(), 'Standard pricing', 10000.00, 500.00, 'active'),
	('b2c3d4e5-f6a7-8901-bcde-f12345678901', '6079', 'Bravento', 3.250, 0.25, 15.00, 25.00, now(), now(), 'Preferred pricing', 15000.00, 750.00, 'active'),
	('c3d4e5f6-a7b8-9012-cdef-123456789012', '6082', '15302781 Canada Inc.', 3.750, 0.35, 20.00, 30.00, now(), now(), NULL, 5000.00, 300.00, 'active'),
	('d4e5f6a7-b8c9-0123-defa-234567890123', '6080', 'Ventoro Group Limited - S', 3.000, 0.20, 15.00, 25.00, now(), now(), 'Volume discount', 25000.00, 1000.00, 'active'),
	('e5f6a7b8-c9d0-1234-efab-345678901234', '6083', 'Ventoro Group Limited - AW', 3.000, 0.20, 15.00, 25.00, now(), now(), 'Volume discount', 25000.00, 1000.00, 'active')
ON CONFLICT (site_id) DO NOTHING;

-- ============================================
-- Grant site access to test user (your staging user)
-- Replace the UUID with your actual test user's ID from auth.users
-- ============================================
-- First, let's see what users exist:
-- SELECT id, email FROM auth.users;

-- Then grant access (uncomment and update UUID):
-- INSERT INTO "public"."user_cpt_site_access" ("user_id", "site_id", "granted_at")
-- SELECT id, site_id, now()
-- FROM auth.users, public.cpt_site_accounts
-- WHERE auth.users.email = 'your-test-email@example.com';

-- Done!
SELECT 'Sample data inserted! Sites: ' || count(*) as status FROM public.cpt_site_accounts;
