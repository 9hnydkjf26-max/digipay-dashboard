


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_duplicates"() RETURNS TABLE("table_name" "text", "id" "text", "stripe_account_id" "text", "payment_provider" "text", "count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'stripe_customers'::TEXT,
    c.id,
    c.stripe_account_id,
    c.payment_provider,
    COUNT(*)::BIGINT
  FROM stripe_customers c
  GROUP BY c.id, c.stripe_account_id, c.payment_provider
  HAVING COUNT(*) > 1;
END;
$$;


ALTER FUNCTION "public"."check_duplicates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_all_account_access_to_user"("user_email" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    target_user_id UUID;
BEGIN
    -- Get the user ID from email
    SELECT id INTO target_user_id
    FROM auth.users
    WHERE email = user_email;
    
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User with email % not found', user_email;
    END IF;
    
    -- Grant access to all existing accounts
    INSERT INTO user_stripe_accounts (user_id, stripe_account_id, payment_provider)
    SELECT 
        target_user_id,
        account_id,
        payment_provider
    FROM payment_accounts
    ON CONFLICT (user_id, stripe_account_id, payment_provider) DO NOTHING;
    
    RAISE NOTICE 'Granted access to % accounts for user %', 
        (SELECT COUNT(*) FROM payment_accounts), user_email;
END;
$$;


ALTER FUNCTION "public"."grant_all_account_access_to_user"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."report_weekly_charges"("year" integer, "month" integer) RETURNS TABLE("week_start" "text", "week_end" "text", "transactions" integer, "gross_amount" "text", "refunded_amount" "text", "net_amount" "text", "eight_percent_of_sales" "text", "one_dollar_per_transaction" "text", "currency" "text")
    LANGUAGE "sql" STABLE
    AS $$
  with refunds_by_charge as (
    select charge as charge_id,
           sum(amount) as refunded_cents
    from public.stripe_refunds
    where to_timestamp(created) >= date_trunc('month', make_date(year, month, 1))
      and to_timestamp(created) <  (date_trunc('month', make_date(year, month, 1)) + interval '1 month')
    group by charge
  ),
  charges_scoped as (
    select c.id,
           c.amount,
           c.currency,
           to_timestamp(c.created) as created_at
    from public.stripe_charges c
    where c.status in ('succeeded','refunded','partially_refunded')
      and to_timestamp(c.created) >= date_trunc('month', make_date(year, month, 1))
      and to_timestamp(c.created) <  (date_trunc('month', make_date(year, month, 1)) + interval '1 month')
  ),
  weekly as (
    select
      date_trunc('week', created_at) as week_start_dt,
      (date_trunc('week', created_at) + interval '6 days') as week_end_dt,
      count(*) as transactions,
      sum(cs.amount) / 100.0 as gross_amount_num,
      sum(coalesce(r.refunded_cents, 0)) / 100.0 as refunded_amount_num,
      (sum(cs.amount) - sum(coalesce(r.refunded_cents, 0))) / 100.0 as net_amount_num,
      round(((sum(cs.amount) - sum(coalesce(r.refunded_cents, 0))) / 100.0) * 0.08, 2) as eight_percent_num,
      round(count(*) * 1.00, 2) as one_dollar_num,
      min(cs.currency) as currency
    from charges_scoped cs
    left join refunds_by_charge r on r.charge_id = cs.id
    group by date_trunc('week', created_at)
  )
  select 
    to_char(week_start_dt, 'YYYY-MM-DD') as week_start,
    to_char(week_end_dt, 'YYYY-MM-DD') as week_end,
    transactions,
    to_char(gross_amount_num, 'FM999999990.00') as gross_amount,
    to_char(refunded_amount_num, 'FM999999990.00') as refunded_amount,
    to_char(net_amount_num, 'FM999999990.00') as net_amount,
    to_char(eight_percent_num, 'FM999999990.00') as eight_percent_of_sales,
    to_char(one_dollar_num, 'FM999999990.00') as one_dollar_per_transaction,
    currency
  from weekly
  order by week_start_dt;
$$;


ALTER FUNCTION "public"."report_weekly_charges"("year" integer, "month" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sync_status"("p_object_type" "text", "p_status" "text", "p_last_sync_id" "text" DEFAULT NULL::"text", "p_total_synced" integer DEFAULT NULL::integer, "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    PERFORM update_sync_status_for_account(
        p_object_type,
        'default',
        p_status,
        p_last_sync_id,
        p_total_synced,
        p_error_message
    );
END;
$$;


ALTER FUNCTION "public"."update_sync_status"("p_object_type" "text", "p_status" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_last_sync_id" "text" DEFAULT NULL::"text", "p_total_synced" integer DEFAULT NULL::integer, "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO stripe_sync_status (
        object_type,
        stripe_account_id,
        status,
        last_sync_at,
        last_sync_id,
        total_synced,
        error_message,
        updated_at
    )
    VALUES (
        p_object_type,
        p_stripe_account_id,
        p_status,
        NOW(),
        p_last_sync_id,
        p_total_synced,
        p_error_message,
        NOW()
    )
    ON CONFLICT (object_type, stripe_account_id) 
    DO UPDATE SET
        status = EXCLUDED.status,
        last_sync_at = EXCLUDED.last_sync_at,
        last_sync_id = COALESCE(EXCLUDED.last_sync_id, stripe_sync_status.last_sync_id),
        total_synced = COALESCE(EXCLUDED.total_synced, stripe_sync_status.total_synced),
        error_message = EXCLUDED.error_message,
        updated_at = EXCLUDED.updated_at;
END;
$$;


ALTER FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_payment_provider" "text" DEFAULT 'stripe'::"text", "p_last_sync_id" "text" DEFAULT NULL::"text", "p_total_synced" integer DEFAULT NULL::integer, "p_error_message" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    INSERT INTO stripe_sync_status (
        object_type,
        stripe_account_id,
        payment_provider,
        status,
        last_sync_at,
        last_sync_id,
        total_synced,
        error_message,
        updated_at
    )
    VALUES (
        p_object_type,
        p_stripe_account_id,
        p_payment_provider,
        p_status,
        NOW(),
        p_last_sync_id,
        p_total_synced,
        p_error_message,
        NOW()
    )
    ON CONFLICT (object_type, stripe_account_id, payment_provider) 
    DO UPDATE SET
        status = EXCLUDED.status,
        last_sync_at = EXCLUDED.last_sync_at,
        last_sync_id = COALESCE(EXCLUDED.last_sync_id, stripe_sync_status.last_sync_id),
        total_synced = COALESCE(EXCLUDED.total_synced, stripe_sync_status.total_synced),
        error_message = EXCLUDED.error_message,
        updated_at = EXCLUDED.updated_at;
END;
$$;


ALTER FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_payment_provider" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."stripe_charges" (
    "id" "text" NOT NULL,
    "customer" "text",
    "payment_intent" "text",
    "amount" bigint,
    "amount_captured" bigint,
    "amount_refunded" bigint,
    "currency" "text",
    "status" "text",
    "paid" boolean,
    "refunded" boolean,
    "disputed" boolean,
    "description" "text",
    "receipt_email" "text",
    "receipt_url" "text",
    "payment_method" "text",
    "payment_method_details" "jsonb",
    "billing_details" "jsonb",
    "metadata" "jsonb",
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp without time zone GENERATED ALWAYS AS ("to_timestamp"(("created")::double precision)) STORED,
    "updated_at" timestamp without time zone GENERATED ALWAYS AS ("to_timestamp"(("updated")::double precision)) STORED,
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_charges" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_charges" IS 'Stripe charge data synced from Stripe API';



CREATE OR REPLACE VIEW "public"."all_charges" AS
 SELECT "id",
    "stripe_account_id" AS "account_id",
    "payment_provider",
    "customer",
    (("amount")::numeric / 100.0) AS "amount_dollars",
    "currency",
    "status",
    "paid",
    "to_timestamp"(("created")::double precision) AS "created_at",
    "description"
   FROM "public"."stripe_charges"
  ORDER BY "created" DESC;


ALTER VIEW "public"."all_charges" OWNER TO "postgres";


COMMENT ON VIEW "public"."all_charges" IS 'Unified view of charges from all payment providers';



CREATE TABLE IF NOT EXISTS "public"."stripe_customers" (
    "id" "text" NOT NULL,
    "email" "text",
    "name" "text",
    "description" "text",
    "phone" "text",
    "address" "jsonb",
    "shipping" "jsonb",
    "metadata" "jsonb",
    "balance" integer,
    "currency" "text",
    "delinquent" boolean,
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_customers" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_customers" IS 'Stripe customer data synced from Stripe API';



COMMENT ON COLUMN "public"."stripe_customers"."stripe_account_id" IS 'Identifies which Stripe account this data belongs to';



COMMENT ON COLUMN "public"."stripe_customers"."payment_provider" IS 'Payment provider: stripe or airwallex';



CREATE OR REPLACE VIEW "public"."all_customers" AS
 SELECT "id",
    "stripe_account_id" AS "account_id",
    "payment_provider",
    "email",
    "name",
    "to_timestamp"(("created")::double precision) AS "created_at",
    "to_timestamp"(("updated")::double precision) AS "updated_at",
    "balance",
    "currency",
    "deleted"
   FROM "public"."stripe_customers"
  ORDER BY "created" DESC;


ALTER VIEW "public"."all_customers" OWNER TO "postgres";


COMMENT ON VIEW "public"."all_customers" IS 'Unified view of customers from all payment providers';



CREATE TABLE IF NOT EXISTS "public"."payment_accounts" (
    "account_id" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "environment" "text",
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "api_key_number" "text",
    CONSTRAINT "stripe_accounts_environment_check" CHECK (("environment" = ANY (ARRAY['test'::"text", 'live'::"text"])))
);


ALTER TABLE "public"."payment_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_accounts" IS 'Tracks accounts from multiple payment providers (Stripe, Airwallex, etc.)';



COMMENT ON COLUMN "public"."payment_accounts"."api_key_number" IS 'Environment variable name for the Stripe API key (e.g., STRIPE_ACCOUNT_2_KEY)';



CREATE TABLE IF NOT EXISTS "public"."refund_audit_log" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."refund_audit_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."recent_refund_activity" AS
 SELECT "ra"."id",
    "ra"."user_id",
    "u"."email" AS "user_email",
    "ra"."action",
    "ra"."details",
    "ra"."created_at"
   FROM ("public"."refund_audit_log" "ra"
     LEFT JOIN "auth"."users" "u" ON (("u"."id" = "ra"."user_id")))
  ORDER BY "ra"."created_at" DESC;


ALTER VIEW "public"."recent_refund_activity" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."refund_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."refund_audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."refund_audit_log_id_seq" OWNED BY "public"."refund_audit_log"."id";



CREATE OR REPLACE VIEW "public"."revenue_by_provider" AS
 SELECT "payment_provider",
    "stripe_account_id" AS "account_id",
    "currency",
    "count"(*) AS "charge_count",
    ("sum"("amount") / 100.0) AS "total_revenue",
    ("avg"("amount") / 100.0) AS "avg_transaction",
    "min"("to_timestamp"(("created")::double precision)) AS "first_charge",
    "max"("to_timestamp"(("created")::double precision)) AS "last_charge"
   FROM "public"."stripe_charges"
  WHERE ("paid" = true)
  GROUP BY "payment_provider", "stripe_account_id", "currency"
  ORDER BY "payment_provider", "stripe_account_id";


ALTER VIEW "public"."revenue_by_provider" OWNER TO "postgres";


COMMENT ON VIEW "public"."revenue_by_provider" IS 'Revenue breakdown by payment provider and account';



CREATE OR REPLACE VIEW "public"."stripe_customers_by_account" AS
 SELECT "stripe_account_id",
    "count"(*) AS "total_customers",
    "count"(*) FILTER (WHERE ("deleted" = false)) AS "active_customers",
    "count"(*) FILTER (WHERE ("deleted" = true)) AS "deleted_customers",
    "max"("synced_at") AS "last_synced"
   FROM "public"."stripe_customers"
  GROUP BY "stripe_account_id";


ALTER VIEW "public"."stripe_customers_by_account" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_disputes" (
    "id" "text" NOT NULL,
    "charge" "text",
    "payment_intent" "text",
    "amount" bigint,
    "currency" "text",
    "status" "text",
    "reason" "text",
    "evidence" "jsonb",
    "evidence_details" "jsonb",
    "metadata" "jsonb",
    "is_charge_refundable" boolean,
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_disputes" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_disputes" IS 'Stripe dispute data synced from Stripe API';



CREATE TABLE IF NOT EXISTS "public"."stripe_invoices" (
    "id" "text" NOT NULL,
    "customer" "text",
    "subscription" "text",
    "number" "text",
    "status" "text",
    "amount_due" bigint,
    "amount_paid" bigint,
    "amount_remaining" bigint,
    "currency" "text",
    "description" "text",
    "hosted_invoice_url" "text",
    "invoice_pdf" "text",
    "lines" "jsonb",
    "metadata" "jsonb",
    "period_start" bigint,
    "period_end" bigint,
    "paid" boolean,
    "attempted" boolean,
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_invoices" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_invoices" IS 'Stripe invoice data synced from Stripe API';



CREATE TABLE IF NOT EXISTS "public"."stripe_payment_intents" (
    "id" "text" NOT NULL,
    "customer" "text",
    "amount" bigint,
    "amount_received" bigint,
    "currency" "text",
    "status" "text",
    "description" "text",
    "receipt_email" "text",
    "payment_method" "text",
    "payment_method_types" "text"[],
    "invoice" "text",
    "metadata" "jsonb",
    "charges" "jsonb",
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_payment_intents" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_payment_intents" IS 'Stripe payment intent data synced from Stripe API';



CREATE TABLE IF NOT EXISTS "public"."stripe_prices" (
    "id" "text" NOT NULL,
    "product" "text",
    "active" boolean,
    "currency" "text",
    "unit_amount" bigint,
    "unit_amount_decimal" "text",
    "type" "text",
    "recurring" "jsonb",
    "billing_scheme" "text",
    "metadata" "jsonb",
    "nickname" "text",
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_prices" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_prices" IS 'Stripe pricing data synced from Stripe API';



CREATE TABLE IF NOT EXISTS "public"."stripe_products" (
    "id" "text" NOT NULL,
    "name" "text",
    "description" "text",
    "active" boolean,
    "metadata" "jsonb",
    "images" "text"[],
    "default_price" "text",
    "unit_label" "text",
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_products" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_products" IS 'Stripe product catalog synced from Stripe API';



CREATE TABLE IF NOT EXISTS "public"."stripe_refunds" (
    "id" "text" NOT NULL,
    "charge" "text",
    "payment_intent" "text",
    "amount" bigint,
    "currency" "text",
    "status" "text",
    "reason" "text",
    "receipt_number" "text",
    "metadata" "jsonb",
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_refunds" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_refunds" IS 'Stripe refund data synced from Stripe API';



CREATE OR REPLACE VIEW "public"."stripe_revenue_by_account" AS
 SELECT "stripe_account_id",
    "currency",
    "count"(*) AS "charge_count",
    ("sum"("amount") / 100.0) AS "total_revenue",
    ("avg"("amount") / 100.0) AS "avg_transaction",
    "min"("to_timestamp"(("created")::double precision)) AS "first_charge",
    "max"("to_timestamp"(("created")::double precision)) AS "last_charge"
   FROM "public"."stripe_charges"
  WHERE ("paid" = true)
  GROUP BY "stripe_account_id", "currency";


ALTER VIEW "public"."stripe_revenue_by_account" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_subscriptions" (
    "id" "text" NOT NULL,
    "customer" "text",
    "status" "text",
    "current_period_start" bigint,
    "current_period_end" bigint,
    "cancel_at_period_end" boolean,
    "cancel_at" bigint,
    "canceled_at" bigint,
    "ended_at" bigint,
    "trial_start" bigint,
    "trial_end" bigint,
    "items" "jsonb",
    "metadata" "jsonb",
    "default_payment_method" "text",
    "latest_invoice" "text",
    "created" bigint,
    "updated" bigint,
    "deleted" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_subscriptions" IS 'Stripe subscription data synced from Stripe API';



CREATE OR REPLACE VIEW "public"."stripe_subscriptions_by_account" AS
 SELECT "stripe_account_id",
    "status",
    "count"(*) AS "subscription_count",
    "max"("to_timestamp"(("created")::double precision)) AS "most_recent"
   FROM "public"."stripe_subscriptions"
  GROUP BY "stripe_account_id", "status";


ALTER VIEW "public"."stripe_subscriptions_by_account" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_sync_status" (
    "object_type" "text" NOT NULL,
    "stripe_account_id" "text" DEFAULT 'default'::"text" NOT NULL,
    "last_sync_at" timestamp with time zone,
    "last_sync_id" "text",
    "total_synced" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL
);


ALTER TABLE "public"."stripe_sync_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stripe_warmup_schedule" (
    "id" bigint NOT NULL,
    "week_number" integer NOT NULL,
    "max_daily_volume_cents" integer NOT NULL,
    "max_transaction_size_cents" integer NOT NULL,
    "max_transactions_per_day" integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stripe_warmup_schedule" OWNER TO "postgres";


COMMENT ON TABLE "public"."stripe_warmup_schedule" IS 'Stripe account warmup schedule defining daily limits by week';



COMMENT ON COLUMN "public"."stripe_warmup_schedule"."week_number" IS 'Week number in warmup schedule (1-9+)';



COMMENT ON COLUMN "public"."stripe_warmup_schedule"."max_daily_volume_cents" IS 'Maximum daily volume in cents';



COMMENT ON COLUMN "public"."stripe_warmup_schedule"."max_transaction_size_cents" IS 'Maximum transaction size in cents';



COMMENT ON COLUMN "public"."stripe_warmup_schedule"."max_transactions_per_day" IS 'Maximum number of transactions per day';



CREATE SEQUENCE IF NOT EXISTS "public"."stripe_warmup_schedule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stripe_warmup_schedule_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stripe_warmup_schedule_id_seq" OWNED BY "public"."stripe_warmup_schedule"."id";



CREATE TABLE IF NOT EXISTS "public"."telegram_sessions" (
    "telegram_chat_id" bigint NOT NULL,
    "supabase_user_id" "uuid" NOT NULL,
    "is_authenticated" boolean DEFAULT false NOT NULL,
    "refresh_token" "text",
    "last_refreshed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telegram_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_stripe_accounts" (
    "user_id" "uuid" NOT NULL,
    "stripe_account_id" "text" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text",
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    CONSTRAINT "user_stripe_accounts_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."user_stripe_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_stripe_accounts" IS 'Controls which users can access which Stripe accounts';



CREATE TABLE IF NOT EXISTS "public"."user_stripe_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "supabase_user_id" "uuid",
    "email" "text" NOT NULL,
    "stripe_secret_key" "text",
    "key_issuer" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_stripe_keys_provider_check" CHECK ((("key_issuer" IS NULL) OR ("key_issuer" = ANY (ARRAY['stripe'::"text", 'airwallex'::"text"]))))
);


ALTER TABLE "public"."user_stripe_keys" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_stripe_keys"."key_issuer" IS 'which processor the key comes from';



ALTER TABLE ONLY "public"."refund_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."refund_audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stripe_warmup_schedule" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stripe_warmup_schedule_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("account_id", "payment_provider");



ALTER TABLE ONLY "public"."refund_audit_log"
    ADD CONSTRAINT "refund_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_charges"
    ADD CONSTRAINT "stripe_charges_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_customers"
    ADD CONSTRAINT "stripe_customers_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_disputes"
    ADD CONSTRAINT "stripe_disputes_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_invoices"
    ADD CONSTRAINT "stripe_invoices_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_payment_intents"
    ADD CONSTRAINT "stripe_payment_intents_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_prices"
    ADD CONSTRAINT "stripe_prices_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_products"
    ADD CONSTRAINT "stripe_products_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_refunds"
    ADD CONSTRAINT "stripe_refunds_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_subscriptions"
    ADD CONSTRAINT "stripe_subscriptions_pkey" PRIMARY KEY ("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_sync_status"
    ADD CONSTRAINT "stripe_sync_status_pkey" PRIMARY KEY ("object_type", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_warmup_schedule"
    ADD CONSTRAINT "stripe_warmup_schedule_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stripe_warmup_schedule"
    ADD CONSTRAINT "stripe_warmup_schedule_week_number_key" UNIQUE ("week_number");



ALTER TABLE ONLY "public"."telegram_sessions"
    ADD CONSTRAINT "telegram_sessions_pkey" PRIMARY KEY ("telegram_chat_id");



ALTER TABLE ONLY "public"."user_stripe_accounts"
    ADD CONSTRAINT "user_stripe_accounts_pkey" PRIMARY KEY ("user_id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."user_stripe_keys"
    ADD CONSTRAINT "user_stripe_keys_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_charges_account" ON "public"."stripe_charges" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_charges_customer" ON "public"."stripe_charges" USING "btree" ("customer");



CREATE INDEX "idx_charges_paid_provider" ON "public"."stripe_charges" USING "btree" ("payment_provider", "paid", "created" DESC) WHERE ("paid" = true);



CREATE INDEX "idx_charges_provider" ON "public"."stripe_charges" USING "btree" ("payment_provider");



CREATE INDEX "idx_charges_receipt_email" ON "public"."stripe_charges" USING "btree" ("receipt_email") WHERE ("receipt_email" IS NOT NULL);



CREATE INDEX "idx_customers_account" ON "public"."stripe_customers" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_customers_created" ON "public"."stripe_customers" USING "btree" ("created");



CREATE INDEX "idx_customers_email" ON "public"."stripe_customers" USING "btree" ("email");



CREATE INDEX "idx_customers_provider" ON "public"."stripe_customers" USING "btree" ("payment_provider");



CREATE INDEX "idx_disputes_account" ON "public"."stripe_disputes" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_disputes_charge" ON "public"."stripe_disputes" USING "btree" ("charge");



CREATE INDEX "idx_disputes_provider" ON "public"."stripe_disputes" USING "btree" ("payment_provider");



CREATE INDEX "idx_invoices_account" ON "public"."stripe_invoices" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_invoices_customer" ON "public"."stripe_invoices" USING "btree" ("customer");



CREATE INDEX "idx_invoices_provider" ON "public"."stripe_invoices" USING "btree" ("payment_provider");



CREATE INDEX "idx_invoices_subscription" ON "public"."stripe_invoices" USING "btree" ("subscription");



CREATE INDEX "idx_payment_accounts_api_key_name" ON "public"."payment_accounts" USING "btree" ("api_key_number");



CREATE INDEX "idx_payment_intents_account" ON "public"."stripe_payment_intents" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_payment_intents_customer" ON "public"."stripe_payment_intents" USING "btree" ("customer");



CREATE INDEX "idx_payment_intents_provider" ON "public"."stripe_payment_intents" USING "btree" ("payment_provider");



CREATE INDEX "idx_payment_intents_status" ON "public"."stripe_payment_intents" USING "btree" ("status");



CREATE INDEX "idx_prices_account" ON "public"."stripe_prices" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_prices_provider" ON "public"."stripe_prices" USING "btree" ("payment_provider");



CREATE INDEX "idx_products_account" ON "public"."stripe_products" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_products_provider" ON "public"."stripe_products" USING "btree" ("payment_provider");



CREATE INDEX "idx_refund_audit_log_action" ON "public"."refund_audit_log" USING "btree" ("action");



CREATE INDEX "idx_refund_audit_log_created_at" ON "public"."refund_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_refund_audit_log_user_id" ON "public"."refund_audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_refunds_account" ON "public"."stripe_refunds" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_refunds_charge" ON "public"."stripe_refunds" USING "btree" ("charge");



CREATE INDEX "idx_refunds_provider" ON "public"."stripe_refunds" USING "btree" ("payment_provider");



CREATE INDEX "idx_stripe_warmup_schedule_week" ON "public"."stripe_warmup_schedule" USING "btree" ("week_number");



CREATE INDEX "idx_subscriptions_account" ON "public"."stripe_subscriptions" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_subscriptions_customer" ON "public"."stripe_subscriptions" USING "btree" ("customer");



CREATE INDEX "idx_subscriptions_provider" ON "public"."stripe_subscriptions" USING "btree" ("payment_provider");



CREATE INDEX "idx_subscriptions_status" ON "public"."stripe_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_telegram_chat_id" ON "public"."telegram_sessions" USING "btree" ("telegram_chat_id");



CREATE INDEX "idx_user_stripe_keys_email" ON "public"."user_stripe_keys" USING "btree" ("lower"("email"));



CREATE OR REPLACE TRIGGER "update_stripe_warmup_schedule_updated_at" BEFORE UPDATE ON "public"."stripe_warmup_schedule" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."refund_audit_log"
    ADD CONSTRAINT "refund_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stripe_charges"
    ADD CONSTRAINT "stripe_charges_customer_fkey" FOREIGN KEY ("customer", "stripe_account_id", "payment_provider") REFERENCES "public"."stripe_customers"("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_invoices"
    ADD CONSTRAINT "stripe_invoices_customer_fkey" FOREIGN KEY ("customer", "stripe_account_id", "payment_provider") REFERENCES "public"."stripe_customers"("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_payment_intents"
    ADD CONSTRAINT "stripe_payment_intents_customer_fkey" FOREIGN KEY ("customer", "stripe_account_id", "payment_provider") REFERENCES "public"."stripe_customers"("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_prices"
    ADD CONSTRAINT "stripe_prices_product_fkey" FOREIGN KEY ("product", "stripe_account_id", "payment_provider") REFERENCES "public"."stripe_products"("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."stripe_subscriptions"
    ADD CONSTRAINT "stripe_subscriptions_customer_fkey" FOREIGN KEY ("customer", "stripe_account_id", "payment_provider") REFERENCES "public"."stripe_customers"("id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."telegram_sessions"
    ADD CONSTRAINT "telegram_sessions_supabase_user_id_fkey" FOREIGN KEY ("supabase_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stripe_accounts"
    ADD CONSTRAINT "user_stripe_accounts_account_fkey" FOREIGN KEY ("stripe_account_id", "payment_provider") REFERENCES "public"."payment_accounts"("account_id", "payment_provider") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stripe_accounts"
    ADD CONSTRAINT "user_stripe_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stripe_keys"
    ADD CONSTRAINT "user_stripe_keys_supabase_user_id_fkey" FOREIGN KEY ("supabase_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Allow authenticated users to read charges" ON "public"."stripe_charges" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read disputes" ON "public"."stripe_disputes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read invoices" ON "public"."stripe_invoices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read payment intents" ON "public"."stripe_payment_intents" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read payment_accounts" ON "public"."payment_accounts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read prices" ON "public"."stripe_prices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read products" ON "public"."stripe_products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read refunds" ON "public"."stripe_refunds" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read stripe_charges" ON "public"."stripe_charges" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read stripe_disputes" ON "public"."stripe_disputes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read stripe_refunds" ON "public"."stripe_refunds" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read subscriptions" ON "public"."stripe_subscriptions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow service role full access to charges" ON "public"."stripe_charges" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to disputes" ON "public"."stripe_disputes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to invoices" ON "public"."stripe_invoices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to payment intents" ON "public"."stripe_payment_intents" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to prices" ON "public"."stripe_prices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to products" ON "public"."stripe_products" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to refunds" ON "public"."stripe_refunds" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to subscriptions" ON "public"."stripe_subscriptions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."refund_audit_log" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_charges" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_customers" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_disputes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_invoices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_payment_intents" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_prices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_products" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_refunds" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access" ON "public"."stripe_subscriptions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to accounts" ON "public"."payment_accounts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to sync status" ON "public"."stripe_sync_status" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to user accounts" ON "public"."user_stripe_accounts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Users can manage their own Stripe keys" ON "public"."user_stripe_keys" USING ((("auth"."uid"() = "supabase_user_id") OR ("lower"("email") = "lower"((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'email'::"text"))) OR ("lower"("email") = "lower"((( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text")))) WITH CHECK ((("auth"."uid"() = "supabase_user_id") OR ("lower"("email") = "lower"((( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"))));



CREATE POLICY "Users can manage their own Telegram session" ON "public"."telegram_sessions" USING (("auth"."uid"() = "supabase_user_id")) WITH CHECK (("auth"."uid"() = "supabase_user_id"));



CREATE POLICY "Users can read accounts they have access to" ON "public"."payment_accounts" FOR SELECT TO "authenticated" USING ((("account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read sync status for their accounts" ON "public"."stripe_sync_status" FOR SELECT TO "authenticated" USING (("stripe_account_id" IN ( SELECT "user_stripe_accounts"."stripe_account_id"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_charges" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_customers" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_disputes" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_invoices" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_payment_intents" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_prices" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_products" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_refunds" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their assigned accounts' data" ON "public"."stripe_subscriptions" FOR SELECT TO "authenticated" USING ((("stripe_account_id", "payment_provider") IN ( SELECT "user_stripe_accounts"."stripe_account_id",
    "user_stripe_accounts"."payment_provider"
   FROM "public"."user_stripe_accounts"
  WHERE ("user_stripe_accounts"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can read their own account assignments" ON "public"."user_stripe_accounts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own audit logs" ON "public"."refund_audit_log" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."payment_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refund_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_charges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_disputes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_payment_intents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_refunds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stripe_sync_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_stripe_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_stripe_keys" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."check_duplicates"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_duplicates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_duplicates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_all_account_access_to_user"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."grant_all_account_access_to_user"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_all_account_access_to_user"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."report_weekly_charges"("year" integer, "month" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."report_weekly_charges"("year" integer, "month" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_weekly_charges"("year" integer, "month" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sync_status"("p_object_type" "text", "p_status" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_sync_status"("p_object_type" "text", "p_status" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sync_status"("p_object_type" "text", "p_status" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_payment_provider" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_payment_provider" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sync_status_for_account"("p_object_type" "text", "p_stripe_account_id" "text", "p_status" "text", "p_payment_provider" "text", "p_last_sync_id" "text", "p_total_synced" integer, "p_error_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."stripe_charges" TO "anon";
GRANT ALL ON TABLE "public"."stripe_charges" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_charges" TO "service_role";



GRANT ALL ON TABLE "public"."all_charges" TO "anon";
GRANT ALL ON TABLE "public"."all_charges" TO "authenticated";
GRANT ALL ON TABLE "public"."all_charges" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_customers" TO "anon";
GRANT ALL ON TABLE "public"."stripe_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_customers" TO "service_role";



GRANT ALL ON TABLE "public"."all_customers" TO "anon";
GRANT ALL ON TABLE "public"."all_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."all_customers" TO "service_role";



GRANT ALL ON TABLE "public"."payment_accounts" TO "anon";
GRANT ALL ON TABLE "public"."payment_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."refund_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."refund_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."refund_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."recent_refund_activity" TO "anon";
GRANT ALL ON TABLE "public"."recent_refund_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_refund_activity" TO "service_role";



GRANT ALL ON SEQUENCE "public"."refund_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."refund_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."refund_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."revenue_by_provider" TO "anon";
GRANT ALL ON TABLE "public"."revenue_by_provider" TO "authenticated";
GRANT ALL ON TABLE "public"."revenue_by_provider" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_customers_by_account" TO "anon";
GRANT ALL ON TABLE "public"."stripe_customers_by_account" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_customers_by_account" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_disputes" TO "anon";
GRANT ALL ON TABLE "public"."stripe_disputes" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_disputes" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_invoices" TO "anon";
GRANT ALL ON TABLE "public"."stripe_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_payment_intents" TO "anon";
GRANT ALL ON TABLE "public"."stripe_payment_intents" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_payment_intents" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_prices" TO "anon";
GRANT ALL ON TABLE "public"."stripe_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_prices" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_products" TO "anon";
GRANT ALL ON TABLE "public"."stripe_products" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_products" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_refunds" TO "anon";
GRANT ALL ON TABLE "public"."stripe_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_refunds" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_revenue_by_account" TO "anon";
GRANT ALL ON TABLE "public"."stripe_revenue_by_account" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_revenue_by_account" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_subscriptions_by_account" TO "anon";
GRANT ALL ON TABLE "public"."stripe_subscriptions_by_account" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_subscriptions_by_account" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_sync_status" TO "anon";
GRANT ALL ON TABLE "public"."stripe_sync_status" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_sync_status" TO "service_role";



GRANT ALL ON TABLE "public"."stripe_warmup_schedule" TO "anon";
GRANT ALL ON TABLE "public"."stripe_warmup_schedule" TO "authenticated";
GRANT ALL ON TABLE "public"."stripe_warmup_schedule" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stripe_warmup_schedule_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stripe_warmup_schedule_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stripe_warmup_schedule_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_sessions" TO "anon";
GRANT ALL ON TABLE "public"."telegram_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."user_stripe_accounts" TO "anon";
GRANT ALL ON TABLE "public"."user_stripe_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."user_stripe_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."user_stripe_keys" TO "anon";
GRANT ALL ON TABLE "public"."user_stripe_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."user_stripe_keys" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";


