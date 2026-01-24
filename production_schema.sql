


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






COMMENT ON SCHEMA "public" IS 'Schema export functions installed - safer than exec_sql';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






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


CREATE OR REPLACE FUNCTION "public"."cpt_check_duplicates"() RETURNS TABLE("cust_session" "text", "transaction_date" timestamp with time zone, "duplicate_count" bigint)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cd.cust_session,
    cd.transaction_date,
    COUNT(*) as duplicate_count
  FROM cpt_data cd
  GROUP BY cd.cust_session, cd.transaction_date
  HAVING COUNT(*) > 1;
END;
$$;


ALTER FUNCTION "public"."cpt_check_duplicates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpt_detect_missing_syncs"() RETURNS TABLE("expected_hour" timestamp with time zone, "has_sync" boolean, "has_transactions" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  WITH expected_hours AS (
    SELECT generate_series(
      DATE_TRUNC('hour', NOW() - INTERVAL '24 hours'),
      DATE_TRUNC('hour', NOW() - INTERVAL '1 hour'),
      '1 hour'::INTERVAL
    ) as hour
  ),
  sync_hours AS (
    SELECT DISTINCT DATE_TRUNC('hour', sync_started_at) as hour
    FROM cpt_sync_log
    WHERE sync_started_at > NOW() - INTERVAL '24 hours'
      AND status = 'success'
  ),
  transaction_hours AS (
    SELECT DISTINCT DATE_TRUNC('hour', synced_at) as hour
    FROM cpt_data
    WHERE synced_at > NOW() - INTERVAL '24 hours'
  )
  SELECT 
    eh.hour,
    (sh.hour IS NOT NULL) as has_sync,
    (th.hour IS NOT NULL) as has_transactions
  FROM expected_hours eh
  LEFT JOIN sync_hours sh ON eh.hour = sh.hour
  LEFT JOIN transaction_hours th ON eh.hour = th.hour
  WHERE sh.hour IS NULL OR th.hour IS NULL
  ORDER BY eh.hour DESC;
END;
$$;


ALTER FUNCTION "public"."cpt_detect_missing_syncs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cpt_latest_sync_status"() RETURNS TABLE("sync_id" bigint, "status" "text", "started_at" timestamp with time zone, "completed_at" timestamp with time zone, "new_records" integer, "duplicates" integer, "duration_seconds" numeric)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    id,
    csl.status,
    sync_started_at,
    sync_completed_at,
    new_records,
    duplicate_records,
    duration_seconds
  FROM cpt_sync_log csl
  ORDER BY sync_started_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."cpt_latest_sync_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_settlement_report_number"() RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN 'SR-' || to_char(now(), 'YYYYMM') || '-' || lpad(nextval('settlement_report_number_seq')::text, 4, '0');
END;
$$;


ALTER FUNCTION "public"."generate_settlement_report_number"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_constraints"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO result
    FROM (
        SELECT
            tc.constraint_name,
            tc.table_name,
            tc.constraint_type,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.update_rule,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        LEFT JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_schema = 'public'
        ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
    ) t;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_constraints"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_constraints"() IS 'Safely returns constraint information';



CREATE OR REPLACE FUNCTION "public"."get_database_functions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO result
    FROM (
        SELECT 
            n.nspname as schema,
            p.proname as name,
            pg_get_function_arguments(p.oid) as arguments,
            l.lanname as language,
            CASE WHEN p.proretset THEN 'setof ' ELSE '' END || 
                pg_catalog.format_type(p.prorettype, NULL) as return_type
        FROM pg_proc p
        LEFT JOIN pg_namespace n ON n.oid = p.pronamespace
        LEFT JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = 'public'
        ORDER BY p.proname
    ) t;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_database_functions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_database_functions"() IS 'Safely returns database function information';



CREATE OR REPLACE FUNCTION "public"."get_extensions"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO result
    FROM (
        SELECT 
            extname as name,
            extversion as version,
            nspname as schema
        FROM pg_extension e
        LEFT JOIN pg_namespace n ON n.oid = e.extnamespace
        ORDER BY extname
    ) t;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_extensions"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_extensions"() IS 'Safely returns extension information';



CREATE OR REPLACE FUNCTION "public"."get_indexes"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO result
    FROM (
        SELECT 
            schemaname,
            tablename,
            indexname,
            indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
    ) t;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_indexes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_indexes"() IS 'Safely returns index information';



CREATE OR REPLACE FUNCTION "public"."get_rls_policies"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO result
    FROM (
        SELECT 
            schemaname,
            tablename,
            policyname,
            permissive,
            roles,
            cmd,
            qual,
            with_check
        FROM pg_policies
        WHERE schemaname = 'public'
        ORDER BY tablename, policyname
    ) t;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_rls_policies"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_rls_policies"() IS 'Safely returns RLS policy information';



CREATE OR REPLACE FUNCTION "public"."get_table_structures"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_agg(row_to_json(t))
    INTO result
    FROM (
        SELECT 
            c.table_name,
            c.column_name,
            c.ordinal_position,
            c.column_default,
            c.is_nullable,
            c.data_type,
            c.udt_name
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
        ORDER BY c.table_name, c.ordinal_position
    ) t;
    
    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_table_structures"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_table_structures"() IS 'Safely returns table structure information';



CREATE OR REPLACE FUNCTION "public"."get_user_cpt_sites"("p_user_id" "uuid") RETURNS TABLE("site_id" "text", "site_name" "text", "account_identifier" "text", "is_active" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
    SELECT 
        s.site_id,
        s.site_name,
        s.account_identifier,
        s.is_active
    FROM cpt_site_accounts s
    INNER JOIN user_cpt_site_access u ON u.site_id = s.site_id
    WHERE u.user_id = p_user_id
      AND s.is_active = true
    ORDER BY s.site_name;
$$;


ALTER FUNCTION "public"."get_user_cpt_sites"("p_user_id" "uuid") OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."grant_user_cpt_site_access"("p_user_id" "uuid", "p_site_ids" "text"[]) RETURNS TABLE("site_id" "text", "granted" boolean, "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH insertions AS (
        INSERT INTO user_cpt_site_access (user_id, site_id, granted_by)
        SELECT p_user_id, unnest(p_site_ids), auth.uid()
        ON CONFLICT (user_id, site_id) DO NOTHING
        RETURNING user_cpt_site_access.site_id
    )
    SELECT 
        s.site_id,
        true as granted,
        'Access granted' as message
    FROM insertions i
    JOIN cpt_site_accounts s ON s.site_id = i.site_id
    UNION ALL
    SELECT 
        unnest(p_site_ids),
        false as granted,
        'Site not found or already has access' as message
    WHERE NOT EXISTS (SELECT 1 FROM insertions);
END;
$$;


ALTER FUNCTION "public"."grant_user_cpt_site_access"("p_user_id" "uuid", "p_site_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND (
      auth.users.raw_user_meta_data->>'role' = 'admin'
      OR auth.users.raw_app_meta_data->>'role' = 'admin'
    )
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


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


CREATE OR REPLACE FUNCTION "public"."update_cpt_data_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_cpt_data_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_plugin_site_health_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_plugin_site_health_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_site_pricing_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_site_pricing_updated_at"() OWNER TO "postgres";


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



CREATE OR REPLACE VIEW "public"."all_charges" WITH ("security_invoker"='true') AS
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


COMMENT ON VIEW "public"."all_charges" IS 'Unified view of charges - uses RLS from stripe_charges';



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



CREATE OR REPLACE VIEW "public"."all_customers" WITH ("security_invoker"='true') AS
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


COMMENT ON VIEW "public"."all_customers" IS 'Unified view of customers - uses RLS from stripe_customers';



CREATE TABLE IF NOT EXISTS "public"."cpt_data" (
    "id" "text" NOT NULL,
    "transaction_date" timestamp with time zone NOT NULL,
    "cust_session" "text" NOT NULL,
    "cust_name" "text",
    "cust_email_ad" "text",
    "cust_amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'CAD'::"text" NOT NULL,
    "cust_trans_id" "text",
    "cust_order_description" "text",
    "status" "text",
    "trans_type" "text" NOT NULL,
    "card_type" "text",
    "site_id" "text",
    "site_name" "text",
    "cp_name" "text",
    "raw_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_refund" boolean DEFAULT false,
    "is_chargeback" boolean DEFAULT false,
    "refund_date" timestamp with time zone,
    "chargeback_date" timestamp with time zone,
    "marked_by" "uuid",
    "is_settled" boolean DEFAULT false,
    "settled_at" timestamp with time zone,
    "settlement_report_id" "uuid"
);


ALTER TABLE "public"."cpt_data" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cpt_daily_summary" AS
 SELECT "date"("transaction_date") AS "transaction_date",
    "trans_type",
    "site_name",
    "count"(*) AS "transaction_count",
    "sum"("cust_amount") AS "total_amount",
    "avg"("cust_amount") AS "avg_amount",
    "min"("cust_amount") AS "min_amount",
    "max"("cust_amount") AS "max_amount",
    "min"("synced_at") AS "first_synced",
    "max"("synced_at") AS "last_synced"
   FROM "public"."cpt_data"
  GROUP BY ("date"("transaction_date")), "trans_type", "site_name"
  ORDER BY ("date"("transaction_date")) DESC, "site_name";


ALTER VIEW "public"."cpt_daily_summary" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cpt_recent_completed" AS
 SELECT "transaction_date",
    "cust_session",
    "cust_name",
    "cust_email_ad",
    "cust_amount",
    "currency",
    "site_name",
    "cust_trans_id",
    "synced_at"
   FROM "public"."cpt_data"
  WHERE ("trans_type" = 'complete'::"text")
  ORDER BY "transaction_date" DESC
 LIMIT 100;


ALTER VIEW "public"."cpt_recent_completed" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cpt_site_accounts" (
    "site_id" "text" NOT NULL,
    "site_name" "text" NOT NULL,
    "cp_name" "text",
    "account_identifier" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cpt_site_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."cpt_site_accounts" IS 'CPT gateway site accounts - separate from Stripe payment accounts';



COMMENT ON COLUMN "public"."cpt_site_accounts"."site_id" IS 'Gateway site ID (e.g., 6070) - PRIMARY KEY';



COMMENT ON COLUMN "public"."cpt_site_accounts"."site_name" IS 'Display name for the site (e.g., MOHWK-STORE)';



COMMENT ON COLUMN "public"."cpt_site_accounts"."account_identifier" IS 'Unique identifier (e.g., cpt_site_6070)';



CREATE TABLE IF NOT EXISTS "public"."cpt_sync_log" (
    "id" bigint NOT NULL,
    "sync_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sync_completed_at" timestamp with time zone,
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "total_fetched" integer DEFAULT 0,
    "total_processed" integer DEFAULT 0,
    "new_records" integer DEFAULT 0,
    "updated_records" integer DEFAULT 0,
    "duplicate_records" integer DEFAULT 0,
    "failed_records" integer DEFAULT 0,
    "earliest_transaction" timestamp with time zone,
    "latest_transaction" timestamp with time zone,
    "errors" "jsonb",
    "error_message" "text",
    "duration_seconds" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "durationseconds" numeric(10,2),
    "totalfetched" integer,
    "totalprocessed" integer,
    "newrecords" integer,
    "updatedrecords" integer,
    "failedrecords" integer,
    "earliesttransaction" timestamp with time zone,
    "latesttransaction" timestamp with time zone
);


ALTER TABLE "public"."cpt_sync_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cpt_sync_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cpt_sync_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cpt_sync_log_id_seq" OWNED BY "public"."cpt_sync_log"."id";



CREATE OR REPLACE VIEW "public"."cpt_sync_performance" AS
 SELECT "date_trunc"('hour'::"text", "sync_started_at") AS "sync_hour",
    "count"(*) AS "sync_count",
    "avg"("total_fetched") AS "avg_fetched",
    "avg"("new_records") AS "avg_new_records",
    "avg"("duplicate_records") AS "avg_duplicates",
    "avg"("duration_seconds") AS "avg_duration_seconds",
    "count"(*) FILTER (WHERE ("status" = 'success'::"text")) AS "successful_syncs",
    "count"(*) FILTER (WHERE ("status" = 'failed'::"text")) AS "failed_syncs"
   FROM "public"."cpt_sync_log"
  WHERE ("sync_started_at" > ("now"() - '7 days'::interval))
  GROUP BY ("date_trunc"('hour'::"text", "sync_started_at"))
  ORDER BY ("date_trunc"('hour'::"text", "sync_started_at")) DESC;


ALTER VIEW "public"."cpt_sync_performance" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cpt_transaction_gaps" AS
 WITH "hourly_counts" AS (
         SELECT "date_trunc"('hour'::"text", "cpt_data"."transaction_date") AS "hour",
            "count"(*) AS "transaction_count"
           FROM "public"."cpt_data"
          WHERE ("cpt_data"."transaction_date" > ("now"() - '7 days'::interval))
          GROUP BY ("date_trunc"('hour'::"text", "cpt_data"."transaction_date"))
        ), "all_hours" AS (
         SELECT "generate_series"("date_trunc"('hour'::"text", ("now"() - '7 days'::interval)), "date_trunc"('hour'::"text", "now"()), '01:00:00'::interval) AS "hour"
        )
 SELECT "ah"."hour",
    COALESCE("hc"."transaction_count", (0)::bigint) AS "transaction_count",
        CASE
            WHEN (COALESCE("hc"."transaction_count", (0)::bigint) = 0) THEN 'No transactions'::"text"
            WHEN (COALESCE("hc"."transaction_count", (0)::bigint) < 5) THEN 'Low volume'::"text"
            ELSE 'Normal'::"text"
        END AS "status"
   FROM ("all_hours" "ah"
     LEFT JOIN "hourly_counts" "hc" ON (("ah"."hour" = "hc"."hour")))
  WHERE ("ah"."hour" < "date_trunc"('hour'::"text", "now"()))
  ORDER BY "ah"."hour" DESC;


ALTER VIEW "public"."cpt_transaction_gaps" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cpt_transactions_by_site" AS
 SELECT "s"."site_id",
    "s"."site_name",
    "s"."account_identifier",
    "count"("c"."id") AS "transaction_count",
    "sum"("c"."cust_amount") FILTER (WHERE ("c"."trans_type" = 'complete'::"text")) AS "total_revenue",
    "count"(*) FILTER (WHERE ("c"."trans_type" = 'complete'::"text")) AS "completed_transactions",
    "count"(*) FILTER (WHERE ("c"."trans_type" = 'incomplete'::"text")) AS "incomplete_transactions",
    "max"("c"."transaction_date") AS "latest_transaction"
   FROM ("public"."cpt_site_accounts" "s"
     LEFT JOIN "public"."cpt_data" "c" ON (("c"."site_id" = "s"."site_id")))
  WHERE ("s"."is_active" = true)
  GROUP BY "s"."site_id", "s"."site_name", "s"."account_identifier"
  ORDER BY ("count"("c"."id")) DESC;


ALTER VIEW "public"."cpt_transactions_by_site" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."etransfer_audit_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "account_id" "text" NOT NULL,
    "recipient_email" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "currency" "text" DEFAULT 'CAD'::"text",
    "payout_id" "text",
    "status" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "details" "jsonb"
);


ALTER TABLE "public"."etransfer_audit_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."etransfer_audit_log" IS 'Audit log for Interac e-Transfers sent via Airwallex';



COMMENT ON COLUMN "public"."etransfer_audit_log"."account_id" IS 'Airwallex account ID from payment_accounts table';



COMMENT ON COLUMN "public"."etransfer_audit_log"."payout_id" IS 'Airwallex payout ID';



COMMENT ON COLUMN "public"."etransfer_audit_log"."status" IS 'Payout status (PENDING, COMPLETED, FAILED, etc.)';



COMMENT ON COLUMN "public"."etransfer_audit_log"."details" IS 'Additional details including recipient name, message, and Airwallex response';



CREATE TABLE IF NOT EXISTS "public"."payment_accounts" (
    "account_id" "text" NOT NULL,
    "account_name" "text",
    "environment" "text",
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "payment_provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "warmup_start_date" "date",
    "secret_key_name" "text",
    "provider_account_id" "text",
    "webhook_configured" boolean DEFAULT false,
    "active_from" "date",
    "active_until" "date",
    "site_id" "text",
    "display_name" "text",
    CONSTRAINT "check_secret_key_format" CHECK ((("secret_key_name" IS NULL) OR ("secret_key_name" ~ '^(STRIPE|AIRWALLEX)_ACCOUNT_[0-9]+_KEY$'::"text"))),
    CONSTRAINT "stripe_accounts_environment_check" CHECK (("environment" = ANY (ARRAY['test'::"text", 'live'::"text"])))
);


ALTER TABLE "public"."payment_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_accounts" IS 'Tracks accounts from multiple payment providers (Stripe, Airwallex, etc.)';



COMMENT ON COLUMN "public"."payment_accounts"."account_id" IS 'Actual payment provider account ID (e.g., acct_xxx for Stripe). This is the technical identifier used in API calls and MUST NOT be changed.';



COMMENT ON COLUMN "public"."payment_accounts"."account_name" IS 'Friendly display name for the account (e.g., "Main Stripe Account", "EU Gateway"). Can be changed without affecting API calls.';



COMMENT ON COLUMN "public"."payment_accounts"."warmup_start_date" IS 'The date when Stripe account warmup period began. Used for compliance reporting.';



COMMENT ON COLUMN "public"."payment_accounts"."secret_key_name" IS 'Name of the Edge Function secret (e.g., STRIPE_ACCOUNT_1_KEY, AIRWALLEX_ACCOUNT_2_KEY)';



COMMENT ON COLUMN "public"."payment_accounts"."active_from" IS 'Date this account started receiving transactions (NULL = no start restriction)';



COMMENT ON COLUMN "public"."payment_accounts"."active_until" IS 'Date this account stopped receiving transactions (NULL = still active)';



CREATE TABLE IF NOT EXISTS "public"."plugin_site_health" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" character varying(50) NOT NULL,
    "site_name" character varying(255),
    "site_url" character varying(500),
    "api_status" character varying(20) DEFAULT 'unknown'::character varying,
    "api_last_check" timestamp with time zone,
    "api_last_success" timestamp with time zone,
    "api_error_message" "text",
    "api_response_time_ms" integer,
    "postback_status" character varying(20) DEFAULT 'unknown'::character varying,
    "postback_last_received" timestamp with time zone,
    "postback_last_success" timestamp with time zone,
    "postback_success_count" integer DEFAULT 0,
    "postback_error_count" integer DEFAULT 0,
    "postback_last_error" "text",
    "has_ssl" boolean,
    "has_curl" boolean,
    "curl_version" character varying(50),
    "can_reach_api" boolean,
    "firewall_issue" boolean,
    "openssl_version" character varying(50),
    "server_software" character varying(100),
    "diagnostic_issues" "jsonb" DEFAULT '[]'::"jsonb",
    "diagnostic_details" "text",
    "last_diagnostic_run" timestamp with time zone,
    "plugin_version" character varying(20),
    "wordpress_version" character varying(20),
    "woocommerce_version" character varying(20),
    "php_version" character varying(20),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."plugin_site_health" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refund_audit_log" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."refund_audit_log" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."recent_refund_activity" WITH ("security_invoker"='true') AS
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


COMMENT ON VIEW "public"."recent_refund_activity" IS 'Recent refund audit activity - authenticated users only';



CREATE SEQUENCE IF NOT EXISTS "public"."refund_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."refund_audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."refund_audit_log_id_seq" OWNED BY "public"."refund_audit_log"."id";



CREATE OR REPLACE VIEW "public"."revenue_by_provider" WITH ("security_invoker"='true') AS
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


COMMENT ON VIEW "public"."revenue_by_provider" IS 'Revenue breakdown by payment provider and account - uses RLS from stripe_charges';



CREATE TABLE IF NOT EXISTS "public"."secret_audit_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "secret_name" "text" NOT NULL,
    "action" "text" NOT NULL,
    "details" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."secret_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settlement_adjustments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "text" NOT NULL,
    "site_name" "text",
    "original_cust_session" "text" NOT NULL,
    "original_transaction_date" timestamp with time zone NOT NULL,
    "original_cust_name" "text",
    "original_cust_email" "text",
    "original_trans_id" "text",
    "original_settlement_report_id" "uuid" NOT NULL,
    "original_settlement_report_number" "text",
    "amount" numeric(12,2) NOT NULL,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "applied_to_settlement_id" "uuid",
    "applied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "notes" "text",
    "original_processing_fee_percent" numeric(5,3) DEFAULT 0,
    "processing_fee_credit" numeric(12,2) DEFAULT 0,
    CONSTRAINT "settlement_adjustments_reason_check" CHECK (("reason" = ANY (ARRAY['refund'::"text", 'chargeback'::"text"]))),
    CONSTRAINT "settlement_adjustments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."settlement_adjustments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settlement_report_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settlement_report_id" "uuid" NOT NULL,
    "cust_session" "text" NOT NULL,
    "transaction_date" timestamp with time zone NOT NULL,
    "cust_name" "text",
    "cust_email" "text",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'CAD'::"text",
    "status" "text",
    "trans_type" "text",
    "cust_trans_id" "text",
    "is_refund" boolean DEFAULT false,
    "is_chargeback" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."settlement_report_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."settlement_report_number_seq"
    START WITH 1000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."settlement_report_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."settlement_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_number" "text" NOT NULL,
    "site_id" "text" NOT NULL,
    "site_name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "total_transactions" integer DEFAULT 0 NOT NULL,
    "gross_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "refunds_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "chargebacks_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "created_by" "uuid" NOT NULL,
    "paid_by" "uuid",
    "notes" "text",
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
    "manual_adjustment_note" "text",
    "merchant_payout" numeric(12,2) DEFAULT 0,
    "processing_fee_credit" numeric(12,2) DEFAULT 0,
    CONSTRAINT "settlement_reports_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."settlement_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."site_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "site_id" "text" NOT NULL,
    "site_name" "text",
    "percentage_fee" numeric(5,3) DEFAULT 0 NOT NULL,
    "per_transaction_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "refund_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "chargeback_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "notes" "text",
    "daily_limit" numeric(12,2) DEFAULT 0,
    "max_ticket_size" numeric(12,2) DEFAULT 0,
    "gateway_status" character varying(20) DEFAULT 'active'::character varying,
    CONSTRAINT "site_pricing_gateway_status_check" CHECK ((("gateway_status")::"text" = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'disabled'::character varying])::"text"[])))
);


ALTER TABLE "public"."site_pricing" OWNER TO "postgres";


COMMENT ON COLUMN "public"."site_pricing"."daily_limit" IS 'Maximum daily transaction volume in dollars. 0 = no limit';



COMMENT ON COLUMN "public"."site_pricing"."max_ticket_size" IS 'Maximum single order amount in dollars. 0 = no limit';



COMMENT ON COLUMN "public"."site_pricing"."gateway_status" IS 'Gateway status: active, suspended, or disabled';



CREATE OR REPLACE VIEW "public"."stripe_customers_by_account" WITH ("security_invoker"='true') AS
 SELECT "stripe_account_id",
    "count"(*) AS "total_customers",
    "count"(*) FILTER (WHERE ("deleted" = false)) AS "active_customers",
    "count"(*) FILTER (WHERE ("deleted" = true)) AS "deleted_customers",
    "max"("synced_at") AS "last_synced"
   FROM "public"."stripe_customers"
  GROUP BY "stripe_account_id";


ALTER VIEW "public"."stripe_customers_by_account" OWNER TO "postgres";


COMMENT ON VIEW "public"."stripe_customers_by_account" IS 'Customer counts by account - uses RLS from stripe_customers';



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



CREATE OR REPLACE VIEW "public"."stripe_revenue_by_account" WITH ("security_invoker"='true') AS
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


COMMENT ON VIEW "public"."stripe_revenue_by_account" IS 'Revenue by account - uses RLS from stripe_charges';



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



CREATE OR REPLACE VIEW "public"."stripe_subscriptions_by_account" WITH ("security_invoker"='true') AS
 SELECT "stripe_account_id",
    "count"(*) AS "total_subscriptions",
    "count"(*) FILTER (WHERE ("status" = 'active'::"text")) AS "active_subscriptions",
    "count"(*) FILTER (WHERE ("status" = 'canceled'::"text")) AS "canceled_subscriptions",
    "max"("synced_at") AS "last_synced"
   FROM "public"."stripe_subscriptions"
  GROUP BY "stripe_account_id";


ALTER VIEW "public"."stripe_subscriptions_by_account" OWNER TO "postgres";


COMMENT ON VIEW "public"."stripe_subscriptions_by_account" IS 'Subscription counts by account - uses RLS from stripe_subscriptions';



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


COMMENT ON TABLE "public"."stripe_warmup_schedule" IS 'Global warmup schedule limits by week - RLS enabled';



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


CREATE TABLE IF NOT EXISTS "public"."user_cpt_site_access" (
    "user_id" "uuid" NOT NULL,
    "site_id" "text" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "granted_by" "uuid"
);


ALTER TABLE "public"."user_cpt_site_access" OWNER TO "postgres";


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



ALTER TABLE ONLY "public"."cpt_sync_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."cpt_sync_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."refund_audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."refund_audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stripe_warmup_schedule" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stripe_warmup_schedule_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."cpt_data"
    ADD CONSTRAINT "cpt_data_pkey" PRIMARY KEY ("cust_session", "transaction_date");



ALTER TABLE ONLY "public"."cpt_site_accounts"
    ADD CONSTRAINT "cpt_site_accounts_account_identifier_key" UNIQUE ("account_identifier");



ALTER TABLE ONLY "public"."cpt_site_accounts"
    ADD CONSTRAINT "cpt_site_accounts_pkey" PRIMARY KEY ("site_id");



ALTER TABLE ONLY "public"."cpt_sync_log"
    ADD CONSTRAINT "cpt_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."etransfer_audit_log"
    ADD CONSTRAINT "etransfer_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_accounts"
    ADD CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("account_id", "payment_provider");



ALTER TABLE ONLY "public"."plugin_site_health"
    ADD CONSTRAINT "plugin_site_health_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plugin_site_health"
    ADD CONSTRAINT "plugin_site_health_site_id_key" UNIQUE ("site_id");



ALTER TABLE ONLY "public"."refund_audit_log"
    ADD CONSTRAINT "refund_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."secret_audit_log"
    ADD CONSTRAINT "secret_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlement_adjustments"
    ADD CONSTRAINT "settlement_adjustments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlement_report_items"
    ADD CONSTRAINT "settlement_report_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlement_reports"
    ADD CONSTRAINT "settlement_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_pricing"
    ADD CONSTRAINT "site_pricing_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."site_pricing"
    ADD CONSTRAINT "site_pricing_site_id_key" UNIQUE ("site_id");



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



ALTER TABLE ONLY "public"."settlement_adjustments"
    ADD CONSTRAINT "unique_adjustment_per_transaction" UNIQUE ("original_cust_session", "original_transaction_date", "reason");



ALTER TABLE ONLY "public"."user_cpt_site_access"
    ADD CONSTRAINT "user_cpt_site_access_pkey" PRIMARY KEY ("user_id", "site_id");



ALTER TABLE ONLY "public"."user_stripe_accounts"
    ADD CONSTRAINT "user_stripe_accounts_pkey" PRIMARY KEY ("user_id", "stripe_account_id", "payment_provider");



ALTER TABLE ONLY "public"."user_stripe_keys"
    ADD CONSTRAINT "user_stripe_keys_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_adjustments_applied_report" ON "public"."settlement_adjustments" USING "btree" ("applied_to_settlement_id");



CREATE INDEX "idx_adjustments_original_report" ON "public"."settlement_adjustments" USING "btree" ("original_settlement_report_id");



CREATE INDEX "idx_adjustments_site" ON "public"."settlement_adjustments" USING "btree" ("site_id");



CREATE INDEX "idx_adjustments_status" ON "public"."settlement_adjustments" USING "btree" ("status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_charges_account" ON "public"."stripe_charges" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_charges_customer" ON "public"."stripe_charges" USING "btree" ("customer");



CREATE INDEX "idx_charges_paid_provider" ON "public"."stripe_charges" USING "btree" ("payment_provider", "paid", "created" DESC) WHERE ("paid" = true);



CREATE INDEX "idx_charges_provider" ON "public"."stripe_charges" USING "btree" ("payment_provider");



CREATE INDEX "idx_charges_receipt_email" ON "public"."stripe_charges" USING "btree" ("receipt_email") WHERE ("receipt_email" IS NOT NULL);



CREATE INDEX "idx_cpt_data_chargeback" ON "public"."cpt_data" USING "btree" ("is_chargeback") WHERE ("is_chargeback" = true);



CREATE INDEX "idx_cpt_data_email" ON "public"."cpt_data" USING "btree" ("cust_email_ad") WHERE ("cust_email_ad" IS NOT NULL);



CREATE INDEX "idx_cpt_data_refund" ON "public"."cpt_data" USING "btree" ("is_refund") WHERE ("is_refund" = true);



CREATE INDEX "idx_cpt_data_session" ON "public"."cpt_data" USING "btree" ("cust_session");



CREATE INDEX "idx_cpt_data_settled" ON "public"."cpt_data" USING "btree" ("is_settled") WHERE ("is_settled" = false);



CREATE INDEX "idx_cpt_data_site" ON "public"."cpt_data" USING "btree" ("site_id", "site_name");



CREATE INDEX "idx_cpt_data_site_complete" ON "public"."cpt_data" USING "btree" ("site_id", "trans_type", "transaction_date" DESC) WHERE ("trans_type" = 'complete'::"text");



CREATE INDEX "idx_cpt_data_synced_at" ON "public"."cpt_data" USING "btree" ("synced_at" DESC);



CREATE INDEX "idx_cpt_data_trans_id" ON "public"."cpt_data" USING "btree" ("cust_trans_id") WHERE ("cust_trans_id" IS NOT NULL);



CREATE UNIQUE INDEX "idx_cpt_data_trans_id_unique" ON "public"."cpt_data" USING "btree" ("cust_trans_id") WHERE (("cust_trans_id" IS NOT NULL) AND ("cust_trans_id" <> ''::"text"));



CREATE INDEX "idx_cpt_data_trans_type" ON "public"."cpt_data" USING "btree" ("trans_type", "transaction_date" DESC);



CREATE INDEX "idx_cpt_data_transaction_date" ON "public"."cpt_data" USING "btree" ("transaction_date" DESC);



CREATE INDEX "idx_cpt_site_accounts_active" ON "public"."cpt_site_accounts" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_cpt_site_accounts_identifier" ON "public"."cpt_site_accounts" USING "btree" ("account_identifier");



CREATE INDEX "idx_cpt_sync_log_started" ON "public"."cpt_sync_log" USING "btree" ("sync_started_at" DESC);



CREATE INDEX "idx_cpt_sync_log_status" ON "public"."cpt_sync_log" USING "btree" ("status", "sync_started_at" DESC);



CREATE INDEX "idx_customers_account" ON "public"."stripe_customers" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_customers_created" ON "public"."stripe_customers" USING "btree" ("created");



CREATE INDEX "idx_customers_email" ON "public"."stripe_customers" USING "btree" ("email");



CREATE INDEX "idx_customers_provider" ON "public"."stripe_customers" USING "btree" ("payment_provider");



CREATE INDEX "idx_disputes_account" ON "public"."stripe_disputes" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_disputes_charge" ON "public"."stripe_disputes" USING "btree" ("charge");



CREATE INDEX "idx_disputes_provider" ON "public"."stripe_disputes" USING "btree" ("payment_provider");



CREATE INDEX "idx_etransfer_audit_account" ON "public"."etransfer_audit_log" USING "btree" ("account_id");



CREATE INDEX "idx_etransfer_audit_created_at" ON "public"."etransfer_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_etransfer_audit_created_by" ON "public"."etransfer_audit_log" USING "btree" ("created_by");



CREATE INDEX "idx_etransfer_audit_payout" ON "public"."etransfer_audit_log" USING "btree" ("payout_id");



CREATE INDEX "idx_invoices_account" ON "public"."stripe_invoices" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_invoices_customer" ON "public"."stripe_invoices" USING "btree" ("customer");



CREATE INDEX "idx_invoices_provider" ON "public"."stripe_invoices" USING "btree" ("payment_provider");



CREATE INDEX "idx_invoices_subscription" ON "public"."stripe_invoices" USING "btree" ("subscription");



CREATE INDEX "idx_payment_accounts_secret_key" ON "public"."payment_accounts" USING "btree" ("secret_key_name");



CREATE INDEX "idx_payment_accounts_site_id" ON "public"."payment_accounts" USING "btree" ("site_id");



CREATE INDEX "idx_payment_accounts_warmup_date" ON "public"."payment_accounts" USING "btree" ("warmup_start_date") WHERE ("warmup_start_date" IS NOT NULL);



CREATE INDEX "idx_payment_intents_account" ON "public"."stripe_payment_intents" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_payment_intents_customer" ON "public"."stripe_payment_intents" USING "btree" ("customer");



CREATE INDEX "idx_payment_intents_provider" ON "public"."stripe_payment_intents" USING "btree" ("payment_provider");



CREATE INDEX "idx_payment_intents_status" ON "public"."stripe_payment_intents" USING "btree" ("status");



CREATE INDEX "idx_plugin_site_health_api_status" ON "public"."plugin_site_health" USING "btree" ("api_status");



CREATE INDEX "idx_plugin_site_health_postback_status" ON "public"."plugin_site_health" USING "btree" ("postback_status");



CREATE INDEX "idx_plugin_site_health_site_id" ON "public"."plugin_site_health" USING "btree" ("site_id");



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



CREATE INDEX "idx_settlement_items_report" ON "public"."settlement_report_items" USING "btree" ("settlement_report_id");



CREATE INDEX "idx_settlement_items_session" ON "public"."settlement_report_items" USING "btree" ("cust_session", "transaction_date");



CREATE INDEX "idx_settlement_reports_created" ON "public"."settlement_reports" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "idx_settlement_reports_number" ON "public"."settlement_reports" USING "btree" ("report_number");



CREATE INDEX "idx_settlement_reports_site" ON "public"."settlement_reports" USING "btree" ("site_id");



CREATE INDEX "idx_settlement_reports_status" ON "public"."settlement_reports" USING "btree" ("status");



CREATE INDEX "idx_site_pricing_site_id" ON "public"."site_pricing" USING "btree" ("site_id");



CREATE INDEX "idx_stripe_warmup_schedule_week" ON "public"."stripe_warmup_schedule" USING "btree" ("week_number");



CREATE INDEX "idx_subscriptions_account" ON "public"."stripe_subscriptions" USING "btree" ("stripe_account_id");



CREATE INDEX "idx_subscriptions_customer" ON "public"."stripe_subscriptions" USING "btree" ("customer");



CREATE INDEX "idx_subscriptions_provider" ON "public"."stripe_subscriptions" USING "btree" ("payment_provider");



CREATE INDEX "idx_subscriptions_status" ON "public"."stripe_subscriptions" USING "btree" ("status");



CREATE INDEX "idx_telegram_chat_id" ON "public"."telegram_sessions" USING "btree" ("telegram_chat_id");



CREATE INDEX "idx_user_cpt_site_access_site" ON "public"."user_cpt_site_access" USING "btree" ("site_id");



CREATE INDEX "idx_user_cpt_site_access_user" ON "public"."user_cpt_site_access" USING "btree" ("user_id");



CREATE INDEX "idx_user_stripe_keys_email" ON "public"."user_stripe_keys" USING "btree" ("lower"("email"));



CREATE OR REPLACE TRIGGER "plugin_site_health_updated_at" BEFORE UPDATE ON "public"."plugin_site_health" FOR EACH ROW EXECUTE FUNCTION "public"."update_plugin_site_health_updated_at"();



CREATE OR REPLACE TRIGGER "site_pricing_updated_at" BEFORE UPDATE ON "public"."site_pricing" FOR EACH ROW EXECUTE FUNCTION "public"."update_site_pricing_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_cpt_data_updated_at" BEFORE UPDATE ON "public"."cpt_data" FOR EACH ROW EXECUTE FUNCTION "public"."update_cpt_data_updated_at"();



CREATE OR REPLACE TRIGGER "update_stripe_warmup_schedule_updated_at" BEFORE UPDATE ON "public"."stripe_warmup_schedule" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."etransfer_audit_log"
    ADD CONSTRAINT "etransfer_audit_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."refund_audit_log"
    ADD CONSTRAINT "refund_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."secret_audit_log"
    ADD CONSTRAINT "secret_audit_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."settlement_adjustments"
    ADD CONSTRAINT "settlement_adjustments_applied_to_settlement_id_fkey" FOREIGN KEY ("applied_to_settlement_id") REFERENCES "public"."settlement_reports"("id");



ALTER TABLE ONLY "public"."settlement_adjustments"
    ADD CONSTRAINT "settlement_adjustments_original_settlement_report_id_fkey" FOREIGN KEY ("original_settlement_report_id") REFERENCES "public"."settlement_reports"("id");



ALTER TABLE ONLY "public"."settlement_report_items"
    ADD CONSTRAINT "settlement_report_items_settlement_report_id_fkey" FOREIGN KEY ("settlement_report_id") REFERENCES "public"."settlement_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_sessions"
    ADD CONSTRAINT "telegram_sessions_supabase_user_id_fkey" FOREIGN KEY ("supabase_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cpt_site_access"
    ADD CONSTRAINT "user_cpt_site_access_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "public"."cpt_site_accounts"("site_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_cpt_site_access"
    ADD CONSTRAINT "user_cpt_site_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stripe_accounts"
    ADD CONSTRAINT "user_stripe_accounts_account_fkey" FOREIGN KEY ("stripe_account_id", "payment_provider") REFERENCES "public"."payment_accounts"("account_id", "payment_provider") NOT VALID;



ALTER TABLE ONLY "public"."user_stripe_keys"
    ADD CONSTRAINT "user_stripe_keys_supabase_user_id_fkey" FOREIGN KEY ("supabase_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete payment accounts" ON "public"."payment_accounts" FOR DELETE USING ("public"."is_admin"());



CREATE POLICY "Admins can insert payment accounts" ON "public"."payment_accounts" FOR INSERT WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can update etransfer logs" ON "public"."etransfer_audit_log" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((("users"."raw_user_meta_data" ->> 'role'::"text") = 'admin'::"text") OR (("users"."raw_app_meta_data" ->> 'role'::"text") = 'admin'::"text"))))));



CREATE POLICY "Admins can update payment accounts" ON "public"."payment_accounts" FOR UPDATE USING ("public"."is_admin"());



CREATE POLICY "Admins can view audit log" ON "public"."secret_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((("users"."raw_user_meta_data" ->> 'role'::"text") = 'admin'::"text") OR (("users"."raw_app_meta_data" ->> 'role'::"text") = 'admin'::"text"))))));



CREATE POLICY "Admins can view etransfer logs" ON "public"."etransfer_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((("users"."raw_user_meta_data" ->> 'role'::"text") = 'admin'::"text") OR (("users"."raw_app_meta_data" ->> 'role'::"text") = 'admin'::"text"))))));



CREATE POLICY "Allow admins full access to cpt_sync_log" ON "public"."cpt_sync_log" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "auth"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ((("users"."raw_user_meta_data" ->> 'role'::"text") = 'admin'::"text") OR (("users"."raw_app_meta_data" ->> 'role'::"text") = 'admin'::"text"))))));



CREATE POLICY "Allow anon insert/update to plugin_site_health" ON "public"."plugin_site_health" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "Allow anon update to plugin_site_health" ON "public"."plugin_site_health" FOR UPDATE TO "anon" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated read access to plugin_site_health" ON "public"."plugin_site_health" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to read CPT data" ON "public"."cpt_data" FOR SELECT TO "authenticated" USING (true);



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



CREATE POLICY "Allow authenticated users to update payment accounts" ON "public"."payment_accounts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_stripe_accounts"
  WHERE (("user_stripe_accounts"."stripe_account_id" = "payment_accounts"."account_id") AND ("user_stripe_accounts"."payment_provider" = "payment_accounts"."payment_provider") AND ("user_stripe_accounts"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_stripe_accounts"
  WHERE (("user_stripe_accounts"."stripe_account_id" = "payment_accounts"."account_id") AND ("user_stripe_accounts"."payment_provider" = "payment_accounts"."payment_provider") AND ("user_stripe_accounts"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow service role full access to charges" ON "public"."stripe_charges" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to cpt_data" ON "public"."cpt_data" TO "service_role" USING (true);



CREATE POLICY "Allow service role full access to cpt_sync_log" ON "public"."cpt_sync_log" TO "service_role" USING (true);



CREATE POLICY "Allow service role full access to disputes" ON "public"."stripe_disputes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to invoices" ON "public"."stripe_invoices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to payment intents" ON "public"."stripe_payment_intents" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to plugin_site_health" ON "public"."plugin_site_health" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to prices" ON "public"."stripe_prices" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to products" ON "public"."stripe_products" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to refunds" ON "public"."stripe_refunds" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Allow service role full access to subscriptions" ON "public"."stripe_subscriptions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated users can read active accounts" ON "public"."cpt_site_accounts" FOR SELECT TO "authenticated" USING (("is_active" = true));



CREATE POLICY "Authenticated users can read warmup schedule" ON "public"."stripe_warmup_schedule" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Service role full access" ON "public"."cpt_site_accounts" TO "service_role" USING (true) WITH CHECK (true);



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



CREATE POLICY "Service role full access" ON "public"."user_cpt_site_access" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to accounts" ON "public"."payment_accounts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to sync status" ON "public"."stripe_sync_status" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to user accounts" ON "public"."user_stripe_accounts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to warmup schedule" ON "public"."stripe_warmup_schedule" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "System can insert etransfer logs" ON "public"."etransfer_audit_log" FOR INSERT WITH CHECK (true);



CREATE POLICY "Users can manage their own Stripe keys" ON "public"."user_stripe_keys" USING ((("auth"."uid"() = "supabase_user_id") OR ("lower"("email") = "lower"((( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text")))) WITH CHECK ((("auth"."uid"() = "supabase_user_id") OR ("lower"("email") = "lower"((( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"))));



COMMENT ON POLICY "Users can manage their own Stripe keys" ON "public"."user_stripe_keys" IS 'Secure policy using auth.uid() and verified email - does not use user_metadata';



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



CREATE POLICY "Users can see their own access" ON "public"."user_cpt_site_access" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own audit logs" ON "public"."refund_audit_log" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "adjustments_delete" ON "public"."settlement_adjustments" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "adjustments_insert" ON "public"."settlement_adjustments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "adjustments_select" ON "public"."settlement_adjustments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "adjustments_update" ON "public"."settlement_adjustments" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."cpt_data" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpt_data_select_policy" ON "public"."cpt_data" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "cpt_data_update_policy" ON "public"."cpt_data" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."cpt_site_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cpt_sync_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpt_sync_log_insert" ON "public"."cpt_sync_log" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "cpt_sync_log_select" ON "public"."cpt_sync_log" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."etransfer_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plugin_site_health" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refund_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."secret_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settlement_adjustments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlement_items_delete" ON "public"."settlement_report_items" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "settlement_items_insert" ON "public"."settlement_report_items" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "settlement_items_select" ON "public"."settlement_report_items" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."settlement_report_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settlement_reports" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlement_reports_delete" ON "public"."settlement_reports" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "settlement_reports_insert" ON "public"."settlement_reports" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "settlement_reports_select" ON "public"."settlement_reports" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "settlement_reports_update" ON "public"."settlement_reports" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."site_pricing" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "site_pricing_delete" ON "public"."site_pricing" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "site_pricing_insert" ON "public"."site_pricing" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "site_pricing_select" ON "public"."site_pricing" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "site_pricing_update" ON "public"."site_pricing" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



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


ALTER TABLE "public"."stripe_warmup_schedule" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."telegram_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_cpt_site_access" ENABLE ROW LEVEL SECURITY;


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



GRANT ALL ON FUNCTION "public"."cpt_check_duplicates"() TO "anon";
GRANT ALL ON FUNCTION "public"."cpt_check_duplicates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cpt_check_duplicates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cpt_detect_missing_syncs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cpt_detect_missing_syncs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cpt_detect_missing_syncs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cpt_latest_sync_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."cpt_latest_sync_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cpt_latest_sync_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_settlement_report_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_settlement_report_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_settlement_report_number"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_constraints"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_constraints"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_constraints"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_database_functions"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_database_functions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_database_functions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_extensions"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_extensions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_extensions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_indexes"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_indexes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_indexes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_rls_policies"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_rls_policies"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_rls_policies"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_table_structures"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_table_structures"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_table_structures"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_cpt_sites"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_cpt_sites"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_cpt_sites"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_all_account_access_to_user"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."grant_all_account_access_to_user"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_all_account_access_to_user"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."grant_user_cpt_site_access"("p_user_id" "uuid", "p_site_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."grant_user_cpt_site_access"("p_user_id" "uuid", "p_site_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_user_cpt_site_access"("p_user_id" "uuid", "p_site_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."report_weekly_charges"("year" integer, "month" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."report_weekly_charges"("year" integer, "month" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."report_weekly_charges"("year" integer, "month" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_cpt_data_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_cpt_data_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_cpt_data_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_plugin_site_health_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_plugin_site_health_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_plugin_site_health_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_site_pricing_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_site_pricing_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_site_pricing_updated_at"() TO "service_role";



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



GRANT ALL ON TABLE "public"."cpt_data" TO "anon";
GRANT ALL ON TABLE "public"."cpt_data" TO "authenticated";
GRANT ALL ON TABLE "public"."cpt_data" TO "service_role";



GRANT ALL ON TABLE "public"."cpt_daily_summary" TO "anon";
GRANT ALL ON TABLE "public"."cpt_daily_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."cpt_daily_summary" TO "service_role";



GRANT ALL ON TABLE "public"."cpt_recent_completed" TO "anon";
GRANT ALL ON TABLE "public"."cpt_recent_completed" TO "authenticated";
GRANT ALL ON TABLE "public"."cpt_recent_completed" TO "service_role";



GRANT ALL ON TABLE "public"."cpt_site_accounts" TO "anon";
GRANT ALL ON TABLE "public"."cpt_site_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."cpt_site_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."cpt_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."cpt_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."cpt_sync_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cpt_sync_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cpt_sync_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cpt_sync_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cpt_sync_performance" TO "anon";
GRANT ALL ON TABLE "public"."cpt_sync_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."cpt_sync_performance" TO "service_role";



GRANT ALL ON TABLE "public"."cpt_transaction_gaps" TO "anon";
GRANT ALL ON TABLE "public"."cpt_transaction_gaps" TO "authenticated";
GRANT ALL ON TABLE "public"."cpt_transaction_gaps" TO "service_role";



GRANT ALL ON TABLE "public"."cpt_transactions_by_site" TO "anon";
GRANT ALL ON TABLE "public"."cpt_transactions_by_site" TO "authenticated";
GRANT ALL ON TABLE "public"."cpt_transactions_by_site" TO "service_role";



GRANT ALL ON TABLE "public"."etransfer_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."etransfer_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."etransfer_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."payment_accounts" TO "anon";
GRANT ALL ON TABLE "public"."payment_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."plugin_site_health" TO "anon";
GRANT ALL ON TABLE "public"."plugin_site_health" TO "authenticated";
GRANT ALL ON TABLE "public"."plugin_site_health" TO "service_role";



GRANT ALL ON TABLE "public"."refund_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."refund_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."refund_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."recent_refund_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."recent_refund_activity" TO "service_role";



GRANT ALL ON SEQUENCE "public"."refund_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."refund_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."refund_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."revenue_by_provider" TO "anon";
GRANT ALL ON TABLE "public"."revenue_by_provider" TO "authenticated";
GRANT ALL ON TABLE "public"."revenue_by_provider" TO "service_role";



GRANT ALL ON TABLE "public"."secret_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."secret_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."secret_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_adjustments" TO "anon";
GRANT ALL ON TABLE "public"."settlement_adjustments" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_adjustments" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_report_items" TO "anon";
GRANT ALL ON TABLE "public"."settlement_report_items" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_report_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."settlement_report_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."settlement_report_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."settlement_report_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."settlement_reports" TO "anon";
GRANT ALL ON TABLE "public"."settlement_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_reports" TO "service_role";



GRANT ALL ON TABLE "public"."site_pricing" TO "anon";
GRANT ALL ON TABLE "public"."site_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."site_pricing" TO "service_role";



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



GRANT ALL ON TABLE "public"."user_cpt_site_access" TO "anon";
GRANT ALL ON TABLE "public"."user_cpt_site_access" TO "authenticated";
GRANT ALL ON TABLE "public"."user_cpt_site_access" TO "service_role";



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































