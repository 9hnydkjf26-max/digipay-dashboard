-- Add reserve columns to site_pricing table
ALTER TABLE "public"."site_pricing" ADD COLUMN IF NOT EXISTS "reserve_amount" numeric DEFAULT 0;
ALTER TABLE "public"."site_pricing" ADD COLUMN IF NOT EXISTS "reserve_collected" numeric DEFAULT 0;

-- Add reserve tracking columns to settlement_reports table
ALTER TABLE "public"."settlement_reports" ADD COLUMN IF NOT EXISTS "reserve_deducted" numeric DEFAULT 0;
ALTER TABLE "public"."settlement_reports" ADD COLUMN IF NOT EXISTS "reserve_balance" numeric DEFAULT 0;
