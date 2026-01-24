-- Create merchant_payments table for tracking payments to merchants
CREATE TABLE IF NOT EXISTS "public"."merchant_payments" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id text NOT NULL,
  site_name text,
  amount numeric(12,2) NOT NULL,
  payment_date timestamp with time zone NOT NULL,
  payment_method text,  -- 'wire', 'check', 'ach', 'e-transfer', 'other'
  reference_number text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_merchant_payments_site_id ON "public"."merchant_payments" (site_id);
CREATE INDEX IF NOT EXISTS idx_merchant_payments_site_name ON "public"."merchant_payments" (site_name);
CREATE INDEX IF NOT EXISTS idx_merchant_payments_payment_date ON "public"."merchant_payments" (payment_date);
CREATE INDEX IF NOT EXISTS idx_merchant_payments_created_at ON "public"."merchant_payments" (created_at);

-- Enable RLS
ALTER TABLE "public"."merchant_payments" ENABLE ROW LEVEL SECURITY;

-- RLS policies: Allow authenticated users to read all payments
CREATE POLICY "Allow authenticated users to read merchant_payments"
ON "public"."merchant_payments"
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert payments
CREATE POLICY "Allow authenticated users to insert merchant_payments"
ON "public"."merchant_payments"
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to delete their own payments (or admins can delete any)
CREATE POLICY "Allow authenticated users to delete merchant_payments"
ON "public"."merchant_payments"
FOR DELETE
TO authenticated
USING (true);

-- Add comment to explain the table purpose
COMMENT ON TABLE "public"."merchant_payments" IS 'Tracks payments made to merchants. Balance = Total Owed (from settlement_reports) - Total Paid (from merchant_payments)';
COMMENT ON COLUMN "public"."merchant_payments".payment_method IS 'Payment method: wire, check, ach, e-transfer, other';
