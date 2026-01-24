-- Staging Branch Migration: Create missing CPT and Settlement tables
-- Run this in the Supabase SQL Editor for the staging branch

-- ============================================
-- TABLES
-- ============================================

-- CPT Data (main transactions table)
CREATE TABLE IF NOT EXISTS "public"."cpt_data" (
    "id" text NOT NULL,
    "transaction_date" timestamp with time zone NOT NULL,
    "cust_session" text NOT NULL,
    "cust_name" text,
    "cust_email_ad" text,
    "cust_amount" numeric(10,2) NOT NULL,
    "currency" text DEFAULT 'CAD'::text NOT NULL,
    "cust_trans_id" text,
    "cust_order_description" text,
    "status" text,
    "trans_type" text NOT NULL,
    "card_type" text,
    "site_id" text,
    "site_name" text,
    "cp_name" text,
    "raw_data" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "synced_at" timestamp with time zone DEFAULT now() NOT NULL,
    "is_refund" boolean DEFAULT false,
    "is_chargeback" boolean DEFAULT false,
    "refund_date" timestamp with time zone,
    "chargeback_date" timestamp with time zone,
    "marked_by" uuid,
    "is_settled" boolean DEFAULT false,
    "settled_at" timestamp with time zone,
    "settlement_report_id" uuid
);

-- CPT Site Accounts
CREATE TABLE IF NOT EXISTS "public"."cpt_site_accounts" (
    "site_id" text NOT NULL,
    "site_name" text NOT NULL,
    "cp_name" text,
    "account_identifier" text NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE "public"."cpt_site_accounts" IS 'CPT gateway site accounts - separate from Stripe payment accounts';
COMMENT ON COLUMN "public"."cpt_site_accounts"."site_id" IS 'Gateway site ID (e.g., 6070) - PRIMARY KEY';
COMMENT ON COLUMN "public"."cpt_site_accounts"."site_name" IS 'Display name for the site (e.g., MOHWK-STORE)';
COMMENT ON COLUMN "public"."cpt_site_accounts"."account_identifier" IS 'Unique identifier (e.g., cpt_site_6070)';

-- CPT Sync Log
CREATE TABLE IF NOT EXISTS "public"."cpt_sync_log" (
    "id" bigint NOT NULL,
    "sync_started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "sync_completed_at" timestamp with time zone,
    "status" text DEFAULT 'running'::text NOT NULL,
    "total_fetched" integer DEFAULT 0,
    "total_processed" integer DEFAULT 0,
    "new_records" integer DEFAULT 0,
    "updated_records" integer DEFAULT 0,
    "duplicate_records" integer DEFAULT 0,
    "failed_records" integer DEFAULT 0,
    "earliest_transaction" timestamp with time zone,
    "latest_transaction" timestamp with time zone,
    "errors" jsonb,
    "error_message" text,
    "duration_seconds" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "durationseconds" numeric(10,2),
    "totalfetched" integer,
    "totalprocessed" integer,
    "newrecords" integer,
    "updatedrecords" integer,
    "failedrecords" integer,
    "earliesttransaction" timestamp with time zone,
    "latesttransaction" timestamp with time zone
);

CREATE SEQUENCE IF NOT EXISTS "public"."cpt_sync_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE "public"."cpt_sync_log_id_seq" OWNED BY "public"."cpt_sync_log"."id";
ALTER TABLE ONLY "public"."cpt_sync_log" ALTER COLUMN "id" SET DEFAULT nextval('"public"."cpt_sync_log_id_seq"'::regclass);

-- Site Pricing
CREATE TABLE IF NOT EXISTS "public"."site_pricing" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "site_id" text NOT NULL,
    "site_name" text,
    "percentage_fee" numeric(5,3) DEFAULT 0 NOT NULL,
    "per_transaction_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "refund_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "chargeback_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_by" uuid,
    "updated_by" uuid,
    "notes" text,
    "daily_limit" numeric(12,2) DEFAULT 0,
    "max_ticket_size" numeric(12,2) DEFAULT 0,
    "gateway_status" character varying(20) DEFAULT 'active'::character varying,
    CONSTRAINT "site_pricing_gateway_status_check" CHECK ((gateway_status::text = ANY (ARRAY['active'::character varying, 'suspended'::character varying, 'disabled'::character varying]::text[])))
);

COMMENT ON COLUMN "public"."site_pricing"."daily_limit" IS 'Maximum daily transaction volume in dollars. 0 = no limit';
COMMENT ON COLUMN "public"."site_pricing"."max_ticket_size" IS 'Maximum single order amount in dollars. 0 = no limit';
COMMENT ON COLUMN "public"."site_pricing"."gateway_status" IS 'Gateway status: active, suspended, or disabled';

-- Settlement Reports
CREATE SEQUENCE IF NOT EXISTS "public"."settlement_report_number_seq"
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE IF NOT EXISTS "public"."settlement_reports" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "report_number" text NOT NULL,
    "site_id" text NOT NULL,
    "site_name" text,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "total_transactions" integer DEFAULT 0 NOT NULL,
    "gross_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "refunds_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "chargebacks_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "paid_at" timestamp with time zone,
    "created_by" uuid NOT NULL,
    "paid_by" uuid,
    "notes" text,
    "adjustments_total" numeric(12,2) DEFAULT 0,
    "adjustments_count" integer DEFAULT 0,
    "processing_fee_percent" numeric(5,3) DEFAULT 0,
    "processing_fee_amount" numeric(12,2) DEFAULT 0,
    "transaction_fee_per" numeric(10,2) DEFAULT 0,
    "transaction_fees_total" numeric(12,2) DEFAULT 0,
    "refund_fee_per" numeric(10,2) DEFAULT 0,
    "refund_fees_total" numeric(12,2) DEFAULT 0,
    "chargeback_fee_per" numeric(10,2) DEFAULT 0,
    "chargeback_fees_total" numeric(12,2) DEFAULT 0,
    "total_fees" numeric(12,2) DEFAULT 0,
    "manual_adjustment" numeric(12,2) DEFAULT 0,
    "manual_adjustment_note" text,
    "merchant_payout" numeric(12,2) DEFAULT 0,
    "processing_fee_credit" numeric(12,2) DEFAULT 0,
    CONSTRAINT "settlement_reports_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])))
);

-- Settlement Report Items
CREATE TABLE IF NOT EXISTS "public"."settlement_report_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "settlement_report_id" uuid NOT NULL,
    "cust_session" text NOT NULL,
    "transaction_date" timestamp with time zone NOT NULL,
    "cust_name" text,
    "cust_email" text,
    "amount" numeric(12,2) NOT NULL,
    "currency" text DEFAULT 'CAD'::text,
    "status" text,
    "trans_type" text,
    "cust_trans_id" text,
    "is_refund" boolean DEFAULT false,
    "is_chargeback" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Settlement Adjustments
CREATE TABLE IF NOT EXISTS "public"."settlement_adjustments" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "site_id" text NOT NULL,
    "site_name" text,
    "original_cust_session" text NOT NULL,
    "original_transaction_date" timestamp with time zone NOT NULL,
    "original_cust_name" text,
    "original_cust_email" text,
    "original_trans_id" text,
    "original_settlement_report_id" uuid NOT NULL,
    "original_settlement_report_number" text,
    "amount" numeric(12,2) NOT NULL,
    "reason" text NOT NULL,
    "status" text DEFAULT 'pending'::text NOT NULL,
    "applied_to_settlement_id" uuid,
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_by" uuid,
    "notes" text,
    "original_processing_fee_percent" numeric(5,3) DEFAULT 0,
    "processing_fee_credit" numeric(12,2) DEFAULT 0,
    CONSTRAINT "settlement_adjustments_reason_check" CHECK ((reason = ANY (ARRAY['refund'::text, 'chargeback'::text]))),
    CONSTRAINT "settlement_adjustments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'applied'::text, 'cancelled'::text])))
);

-- User CPT Site Access
CREATE TABLE IF NOT EXISTS "public"."user_cpt_site_access" (
    "user_id" uuid NOT NULL,
    "site_id" text NOT NULL,
    "granted_at" timestamp with time zone DEFAULT now(),
    "granted_by" uuid
);

-- ============================================
-- PRIMARY KEYS
-- ============================================

ALTER TABLE ONLY "public"."cpt_data"
    ADD CONSTRAINT "cpt_data_pkey" PRIMARY KEY ("cust_session", "transaction_date");

ALTER TABLE ONLY "public"."cpt_site_accounts"
    ADD CONSTRAINT "cpt_site_accounts_pkey" PRIMARY KEY ("site_id");

ALTER TABLE ONLY "public"."cpt_site_accounts"
    ADD CONSTRAINT "cpt_site_accounts_account_identifier_key" UNIQUE ("account_identifier");

ALTER TABLE ONLY "public"."cpt_sync_log"
    ADD CONSTRAINT "cpt_sync_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."site_pricing"
    ADD CONSTRAINT "site_pricing_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."site_pricing"
    ADD CONSTRAINT "site_pricing_site_id_key" UNIQUE ("site_id");

ALTER TABLE ONLY "public"."settlement_reports"
    ADD CONSTRAINT "settlement_reports_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."settlement_report_items"
    ADD CONSTRAINT "settlement_report_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."settlement_adjustments"
    ADD CONSTRAINT "settlement_adjustments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_cpt_site_access"
    ADD CONSTRAINT "user_cpt_site_access_pkey" PRIMARY KEY ("user_id", "site_id");

-- ============================================
-- VIEWS
-- ============================================

CREATE OR REPLACE VIEW "public"."cpt_daily_summary" AS
 SELECT date(transaction_date) AS transaction_date,
    trans_type,
    site_name,
    count(*) AS transaction_count,
    sum(cust_amount) AS total_amount,
    avg(cust_amount) AS avg_amount,
    min(cust_amount) AS min_amount,
    max(cust_amount) AS max_amount,
    min(synced_at) AS first_synced,
    max(synced_at) AS last_synced
   FROM public.cpt_data
  GROUP BY (date(transaction_date)), trans_type, site_name
  ORDER BY (date(transaction_date)) DESC, site_name;

CREATE OR REPLACE VIEW "public"."cpt_recent_completed" AS
 SELECT transaction_date,
    cust_session,
    cust_name,
    cust_email_ad,
    cust_amount,
    currency,
    site_name,
    cust_trans_id,
    synced_at
   FROM public.cpt_data
  WHERE (trans_type = 'complete'::text)
  ORDER BY transaction_date DESC
 LIMIT 100;

CREATE OR REPLACE VIEW "public"."cpt_transactions_by_site" AS
 SELECT s.site_id,
    s.site_name,
    s.account_identifier,
    count(c.id) AS transaction_count,
    sum(c.cust_amount) FILTER (WHERE (c.trans_type = 'complete'::text)) AS total_revenue,
    count(*) FILTER (WHERE (c.trans_type = 'complete'::text)) AS completed_transactions,
    count(*) FILTER (WHERE (c.trans_type = 'incomplete'::text)) AS incomplete_transactions,
    max(c.transaction_date) AS latest_transaction
   FROM (public.cpt_site_accounts s
     LEFT JOIN public.cpt_data c ON ((c.site_id = s.site_id)))
  WHERE (s.is_active = true)
  GROUP BY s.site_id, s.site_name, s.account_identifier
  ORDER BY (count(c.id)) DESC;

-- ============================================
-- RLS POLICIES (basic - adjust as needed)
-- ============================================

ALTER TABLE "public"."cpt_data" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cpt_site_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cpt_sync_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."site_pricing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."settlement_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."settlement_report_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."settlement_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."user_cpt_site_access" ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read cpt_site_accounts (for site dropdown)
CREATE POLICY "Allow authenticated read" ON "public"."cpt_site_accounts"
    FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to read site_pricing
CREATE POLICY "Allow authenticated read" ON "public"."site_pricing"
    FOR SELECT TO authenticated USING (true);

-- Allow authenticated users to read their accessible CPT data
CREATE POLICY "Users can view cpt data for their sites" ON "public"."cpt_data"
    FOR SELECT TO authenticated
    USING (
        site_id IN (
            SELECT site_id FROM public.user_cpt_site_access
            WHERE user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Admin full access policies
CREATE POLICY "Admin full access" ON "public"."cpt_data"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin full access" ON "public"."cpt_site_accounts"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin full access" ON "public"."site_pricing"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin full access" ON "public"."settlement_reports"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin full access" ON "public"."settlement_report_items"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin full access" ON "public"."settlement_adjustments"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin full access" ON "public"."cpt_sync_log"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

CREATE POLICY "Admin full access" ON "public"."user_cpt_site_access"
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE id = auth.uid()
            AND raw_user_meta_data->>'role' = 'admin'
        )
    );

-- Done!
SELECT 'Migration complete! Tables created: cpt_data, cpt_site_accounts, cpt_sync_log, site_pricing, settlement_reports, settlement_report_items, settlement_adjustments, user_cpt_site_access' as status;
