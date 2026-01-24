-- Add is_test column to cpt_data table for marking test transactions
ALTER TABLE "public"."cpt_data" ADD COLUMN IF NOT EXISTS "is_test" boolean DEFAULT false;
ALTER TABLE "public"."cpt_data" ADD COLUMN IF NOT EXISTS "test_marked_at" timestamp with time zone;
