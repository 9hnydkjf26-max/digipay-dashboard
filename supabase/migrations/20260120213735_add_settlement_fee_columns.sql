-- Add settlement_fee column to site_pricing table
ALTER TABLE site_pricing ADD COLUMN IF NOT EXISTS settlement_fee numeric DEFAULT 0;

-- Add settlement_fee columns to settlement_reports table
ALTER TABLE settlement_reports ADD COLUMN IF NOT EXISTS settlement_fee_percent numeric DEFAULT 0;
ALTER TABLE settlement_reports ADD COLUMN IF NOT EXISTS settlement_fee_amount numeric DEFAULT 0;
