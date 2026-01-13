# Supabase Complete Schema Export

**Exported:** 2026-01-13T21:32:37.345Z
**Project:** https://hzdybwclwqkcobpwxzoo.supabase.co

---

## 📊 System Health

**Status:** healthy

**Warnings:**
- ⚠️ 13 sync job(s) haven't run in >48 hours

## 💾 Data Counts

**stripe_customers:** 359 records
**stripe_products:** 4 records
**stripe_prices:** 4 records
**stripe_subscriptions:** 0 records
**stripe_payment_intents:** 210 records
**stripe_charges:** 437 records
**stripe_invoices:** 0 records
**stripe_refunds:** 6 records
**stripe_disputes:** 3 records

## 🔌 Installed Extensions

- **pg_cron** (v1.6.4) - schema: pg_catalog
- **pg_graphql** (v1.5.11) - schema: graphql
- **pg_net** (v0.19.5) - schema: public
- **pg_stat_statements** (v1.11) - schema: extensions
- **pgcrypto** (v1.3) - schema: extensions
- **plpgsql** (v1.0) - schema: pg_catalog
- **supabase_vault** (v0.3.1) - schema: vault
- **uuid-ossp** (v1.1) - schema: extensions

## 🗄️ Table Structures

### all_charges

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | YES | - |
| account_id | text | YES | - |
| payment_provider | text | YES | - |
| customer | text | YES | - |
| amount_dollars | numeric | YES | - |
| currency | text | YES | - |
| status | text | YES | - |
| paid | bool | YES | - |
| created_at | timestamptz | YES | - |
| description | text | YES | - |

### all_customers

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | YES | - |
| account_id | text | YES | - |
| payment_provider | text | YES | - |
| email | text | YES | - |
| name | text | YES | - |
| created_at | timestamptz | YES | - |
| updated_at | timestamptz | YES | - |
| balance | int4 | YES | - |
| currency | text | YES | - |
| deleted | bool | YES | - |

### cpt_daily_summary

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| transaction_date | date | YES | - |
| trans_type | text | YES | - |
| site_name | text | YES | - |
| transaction_count | int8 | YES | - |
| total_amount | numeric | YES | - |
| avg_amount | numeric | YES | - |
| min_amount | numeric | YES | - |
| max_amount | numeric | YES | - |
| first_synced | timestamptz | YES | - |
| last_synced | timestamptz | YES | - |

### cpt_data

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| transaction_date | timestamptz | NO | - |
| cust_session | text | NO | - |
| cust_name | text | YES | - |
| cust_email_ad | text | YES | - |
| cust_amount | numeric | NO | - |
| currency | text | NO | 'CAD'::text |
| cust_trans_id | text | YES | - |
| cust_order_description | text | YES | - |
| status | text | YES | - |
| trans_type | text | NO | - |
| card_type | text | YES | - |
| site_id | text | YES | - |
| site_name | text | YES | - |
| cp_name | text | YES | - |
| raw_data | jsonb | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| synced_at | timestamptz | NO | now() |
| is_refund | bool | YES | false |
| is_chargeback | bool | YES | false |
| refund_date | timestamptz | YES | - |
| chargeback_date | timestamptz | YES | - |
| marked_by | uuid | YES | - |
| is_settled | bool | YES | false |
| settled_at | timestamptz | YES | - |
| settlement_report_id | uuid | YES | - |

### cpt_recent_completed

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| transaction_date | timestamptz | YES | - |
| cust_session | text | YES | - |
| cust_name | text | YES | - |
| cust_email_ad | text | YES | - |
| cust_amount | numeric | YES | - |
| currency | text | YES | - |
| site_name | text | YES | - |
| cust_trans_id | text | YES | - |
| synced_at | timestamptz | YES | - |

### cpt_site_accounts

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| site_id | text | NO | - |
| site_name | text | NO | - |
| cp_name | text | YES | - |
| account_identifier | text | NO | - |
| is_active | bool | YES | true |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

### cpt_sync_log

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | int8 | NO | nextval('cpt_sync_log_id_seq'::regclass) |
| sync_started_at | timestamptz | NO | now() |
| sync_completed_at | timestamptz | YES | - |
| status | text | NO | 'running'::text |
| total_fetched | int4 | YES | 0 |
| total_processed | int4 | YES | 0 |
| new_records | int4 | YES | 0 |
| updated_records | int4 | YES | 0 |
| duplicate_records | int4 | YES | 0 |
| failed_records | int4 | YES | 0 |
| earliest_transaction | timestamptz | YES | - |
| latest_transaction | timestamptz | YES | - |
| errors | jsonb | YES | - |
| error_message | text | YES | - |
| duration_seconds | numeric | YES | - |
| created_at | timestamptz | NO | now() |
| durationseconds | numeric | YES | - |
| totalfetched | int4 | YES | - |
| totalprocessed | int4 | YES | - |
| newrecords | int4 | YES | - |
| updatedrecords | int4 | YES | - |
| failedrecords | int4 | YES | - |
| earliesttransaction | timestamptz | YES | - |
| latesttransaction | timestamptz | YES | - |

### cpt_sync_performance

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| sync_hour | timestamptz | YES | - |
| sync_count | int8 | YES | - |
| avg_fetched | numeric | YES | - |
| avg_new_records | numeric | YES | - |
| avg_duplicates | numeric | YES | - |
| avg_duration_seconds | numeric | YES | - |
| successful_syncs | int8 | YES | - |
| failed_syncs | int8 | YES | - |

### cpt_transaction_gaps

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| hour | timestamptz | YES | - |
| transaction_count | int8 | YES | - |
| status | text | YES | - |

### cpt_transactions_by_site

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| site_id | text | YES | - |
| site_name | text | YES | - |
| account_identifier | text | YES | - |
| transaction_count | int8 | YES | - |
| total_revenue | numeric | YES | - |
| completed_transactions | int8 | YES | - |
| incomplete_transactions | int8 | YES | - |
| latest_transaction | timestamptz | YES | - |

### etransfer_audit_log

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| account_id | text | NO | - |
| recipient_email | text | NO | - |
| amount | numeric | NO | - |
| currency | text | YES | 'CAD'::text |
| payout_id | text | YES | - |
| status | text | YES | - |
| created_by | uuid | YES | - |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| details | jsonb | YES | - |

### payment_accounts

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| account_id | text | NO | - |
| account_name | text | YES | - |
| environment | text | YES | - |
| description | text | YES | - |
| is_active | bool | YES | true |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| payment_provider | text | NO | 'stripe'::text |
| warmup_start_date | date | YES | - |
| secret_key_name | text | YES | - |
| provider_account_id | text | YES | - |
| webhook_configured | bool | YES | false |
| active_from | date | YES | - |
| active_until | date | YES | - |
| site_id | text | YES | - |
| display_name | text | YES | - |

### recent_refund_activity

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | int8 | YES | - |
| user_id | uuid | YES | - |
| user_email | varchar | YES | - |
| action | text | YES | - |
| details | jsonb | YES | - |
| created_at | timestamptz | YES | - |

### refund_audit_log

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | int8 | NO | nextval('refund_audit_log_id_seq'::regclass) |
| user_id | uuid | NO | - |
| action | text | NO | - |
| details | jsonb | YES | - |
| created_at | timestamptz | NO | now() |

### revenue_by_provider

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| payment_provider | text | YES | - |
| account_id | text | YES | - |
| currency | text | YES | - |
| charge_count | int8 | YES | - |
| total_revenue | numeric | YES | - |
| avg_transaction | numeric | YES | - |
| first_charge | timestamptz | YES | - |
| last_charge | timestamptz | YES | - |

### secret_audit_log

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | extensions.uuid_generate_v4() |
| secret_name | text | NO | - |
| action | text | NO | - |
| details | text | YES | - |
| created_at | timestamptz | YES | now() |
| created_by | uuid | YES | - |

### settlement_adjustments

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| site_id | text | NO | - |
| site_name | text | YES | - |
| original_cust_session | text | NO | - |
| original_transaction_date | timestamptz | NO | - |
| original_cust_name | text | YES | - |
| original_cust_email | text | YES | - |
| original_trans_id | text | YES | - |
| original_settlement_report_id | uuid | NO | - |
| original_settlement_report_number | text | YES | - |
| amount | numeric | NO | - |
| reason | text | NO | - |
| status | text | NO | 'pending'::text |
| applied_to_settlement_id | uuid | YES | - |
| applied_at | timestamptz | YES | - |
| created_at | timestamptz | NO | now() |
| created_by | uuid | YES | - |
| notes | text | YES | - |
| original_processing_fee_percent | numeric | YES | 0 |
| processing_fee_credit | numeric | YES | 0 |

### settlement_report_items

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| settlement_report_id | uuid | NO | - |
| cust_session | text | NO | - |
| transaction_date | timestamptz | NO | - |
| cust_name | text | YES | - |
| cust_email | text | YES | - |
| amount | numeric | NO | - |
| currency | text | YES | 'CAD'::text |
| status | text | YES | - |
| trans_type | text | YES | - |
| cust_trans_id | text | YES | - |
| is_refund | bool | YES | false |
| is_chargeback | bool | YES | false |
| created_at | timestamptz | NO | now() |

### settlement_reports

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| report_number | text | NO | - |
| site_id | text | NO | - |
| site_name | text | YES | - |
| status | text | NO | 'pending'::text |
| total_transactions | int4 | NO | 0 |
| gross_amount | numeric | NO | 0 |
| refunds_amount | numeric | NO | 0 |
| chargebacks_amount | numeric | NO | 0 |
| net_amount | numeric | NO | 0 |
| period_start | timestamptz | YES | - |
| period_end | timestamptz | YES | - |
| created_at | timestamptz | NO | now() |
| paid_at | timestamptz | YES | - |
| created_by | uuid | NO | - |
| paid_by | uuid | YES | - |
| notes | text | YES | - |
| adjustments_total | numeric | YES | 0 |
| adjustments_count | int4 | YES | 0 |
| processing_fee_percent | numeric | YES | 0 |
| processing_fee_amount | numeric | YES | 0 |
| transaction_fee_per | numeric | YES | 0 |
| transaction_fees_total | numeric | YES | 0 |
| refund_fee_per | numeric | YES | 0 |
| refund_fees_total | numeric | YES | 0 |
| chargeback_fee_per | numeric | YES | 0 |
| chargeback_fees_total | numeric | YES | 0 |
| total_fees | numeric | YES | 0 |
| manual_adjustment | numeric | YES | 0 |
| manual_adjustment_note | text | YES | - |
| merchant_payout | numeric | YES | 0 |
| processing_fee_credit | numeric | YES | 0 |

### site_pricing

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| site_id | text | NO | - |
| site_name | text | YES | - |
| percentage_fee | numeric | NO | 0 |
| per_transaction_fee | numeric | NO | 0 |
| refund_fee | numeric | NO | 0 |
| chargeback_fee | numeric | NO | 0 |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| created_by | uuid | YES | - |
| updated_by | uuid | YES | - |
| notes | text | YES | - |
| daily_limit | numeric | YES | 0 |
| max_ticket_size | numeric | YES | 0 |
| gateway_status | varchar | YES | 'active'::character varying |

### stripe_charges

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| customer | text | YES | - |
| payment_intent | text | YES | - |
| amount | int8 | YES | - |
| amount_captured | int8 | YES | - |
| amount_refunded | int8 | YES | - |
| currency | text | YES | - |
| status | text | YES | - |
| paid | bool | YES | - |
| refunded | bool | YES | - |
| disputed | bool | YES | - |
| description | text | YES | - |
| receipt_email | text | YES | - |
| receipt_url | text | YES | - |
| payment_method | text | YES | - |
| payment_method_details | jsonb | YES | - |
| billing_details | jsonb | YES | - |
| metadata | jsonb | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| created_at | timestamp | YES | - |
| updated_at | timestamp | YES | - |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_customers

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| email | text | YES | - |
| name | text | YES | - |
| description | text | YES | - |
| phone | text | YES | - |
| address | jsonb | YES | - |
| shipping | jsonb | YES | - |
| metadata | jsonb | YES | - |
| balance | int4 | YES | - |
| currency | text | YES | - |
| delinquent | bool | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_customers_by_account

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| stripe_account_id | text | YES | - |
| total_customers | int8 | YES | - |
| active_customers | int8 | YES | - |
| deleted_customers | int8 | YES | - |
| last_synced | timestamptz | YES | - |

### stripe_disputes

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| charge | text | YES | - |
| payment_intent | text | YES | - |
| amount | int8 | YES | - |
| currency | text | YES | - |
| status | text | YES | - |
| reason | text | YES | - |
| evidence | jsonb | YES | - |
| evidence_details | jsonb | YES | - |
| metadata | jsonb | YES | - |
| is_charge_refundable | bool | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_invoices

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| customer | text | YES | - |
| subscription | text | YES | - |
| number | text | YES | - |
| status | text | YES | - |
| amount_due | int8 | YES | - |
| amount_paid | int8 | YES | - |
| amount_remaining | int8 | YES | - |
| currency | text | YES | - |
| description | text | YES | - |
| hosted_invoice_url | text | YES | - |
| invoice_pdf | text | YES | - |
| lines | jsonb | YES | - |
| metadata | jsonb | YES | - |
| period_start | int8 | YES | - |
| period_end | int8 | YES | - |
| paid | bool | YES | - |
| attempted | bool | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_payment_intents

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| customer | text | YES | - |
| amount | int8 | YES | - |
| amount_received | int8 | YES | - |
| currency | text | YES | - |
| status | text | YES | - |
| description | text | YES | - |
| receipt_email | text | YES | - |
| payment_method | text | YES | - |
| payment_method_types | _text | YES | - |
| invoice | text | YES | - |
| metadata | jsonb | YES | - |
| charges | jsonb | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_prices

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| product | text | YES | - |
| active | bool | YES | - |
| currency | text | YES | - |
| unit_amount | int8 | YES | - |
| unit_amount_decimal | text | YES | - |
| type | text | YES | - |
| recurring | jsonb | YES | - |
| billing_scheme | text | YES | - |
| metadata | jsonb | YES | - |
| nickname | text | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_products

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| name | text | YES | - |
| description | text | YES | - |
| active | bool | YES | - |
| metadata | jsonb | YES | - |
| images | _text | YES | - |
| default_price | text | YES | - |
| unit_label | text | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_refunds

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| charge | text | YES | - |
| payment_intent | text | YES | - |
| amount | int8 | YES | - |
| currency | text | YES | - |
| status | text | YES | - |
| reason | text | YES | - |
| receipt_number | text | YES | - |
| metadata | jsonb | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_revenue_by_account

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| stripe_account_id | text | YES | - |
| currency | text | YES | - |
| charge_count | int8 | YES | - |
| total_revenue | numeric | YES | - |
| avg_transaction | numeric | YES | - |
| first_charge | timestamptz | YES | - |
| last_charge | timestamptz | YES | - |

### stripe_subscriptions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | text | NO | - |
| customer | text | YES | - |
| status | text | YES | - |
| current_period_start | int8 | YES | - |
| current_period_end | int8 | YES | - |
| cancel_at_period_end | bool | YES | - |
| cancel_at | int8 | YES | - |
| canceled_at | int8 | YES | - |
| ended_at | int8 | YES | - |
| trial_start | int8 | YES | - |
| trial_end | int8 | YES | - |
| items | jsonb | YES | - |
| metadata | jsonb | YES | - |
| default_payment_method | text | YES | - |
| latest_invoice | text | YES | - |
| created | int8 | YES | - |
| updated | int8 | YES | - |
| deleted | bool | YES | false |
| synced_at | timestamptz | YES | now() |
| stripe_account_id | text | NO | 'default'::text |
| payment_provider | text | NO | 'stripe'::text |

### stripe_subscriptions_by_account

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| stripe_account_id | text | YES | - |
| total_subscriptions | int8 | YES | - |
| active_subscriptions | int8 | YES | - |
| canceled_subscriptions | int8 | YES | - |
| last_synced | timestamptz | YES | - |

### stripe_sync_status

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| object_type | text | NO | - |
| stripe_account_id | text | NO | 'default'::text |
| last_sync_at | timestamptz | YES | - |
| last_sync_id | text | YES | - |
| total_synced | int4 | YES | 0 |
| status | text | YES | 'pending'::text |
| error_message | text | YES | - |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |
| payment_provider | text | NO | 'stripe'::text |

### stripe_warmup_schedule

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | int8 | NO | nextval('stripe_warmup_schedule_id_seq'::regclass) |
| week_number | int4 | NO | - |
| max_daily_volume_cents | int4 | NO | - |
| max_transaction_size_cents | int4 | NO | - |
| max_transactions_per_day | int4 | NO | - |
| updated_at | timestamptz | YES | now() |

### telegram_sessions

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| telegram_chat_id | int8 | NO | - |
| supabase_user_id | uuid | NO | - |
| is_authenticated | bool | NO | false |
| refresh_token | text | YES | - |
| last_refreshed_at | timestamptz | YES | - |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |

### user_cpt_site_access

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| user_id | uuid | NO | - |
| site_id | text | NO | - |
| granted_at | timestamptz | YES | now() |
| granted_by | uuid | YES | - |

### user_stripe_accounts

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| user_id | uuid | NO | - |
| stripe_account_id | text | NO | - |
| role | text | YES | 'viewer'::text |
| granted_at | timestamptz | YES | now() |
| payment_provider | text | NO | 'stripe'::text |

### user_stripe_keys

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| supabase_user_id | uuid | YES | - |
| email | text | NO | - |
| stripe_secret_key | text | YES | - |
| key_issuer | text | YES | - |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

## 🔗 Constraints

### cpt_data

- **2200_42304_11_not_null** (CHECK)
- **2200_42304_17_not_null** (CHECK)
- **2200_42304_18_not_null** (CHECK)
- **2200_42304_19_not_null** (CHECK)
- **2200_42304_1_not_null** (CHECK)
- **2200_42304_2_not_null** (CHECK)
- **2200_42304_3_not_null** (CHECK)
- **2200_42304_6_not_null** (CHECK)
- **2200_42304_7_not_null** (CHECK)
- **cpt_data_pkey** (PRIMARY KEY)
  - Column: transaction_date
  - References: cpt_data(transaction_date)
- **cpt_data_pkey** (PRIMARY KEY)
  - Column: transaction_date
  - References: cpt_data(cust_session)
- **cpt_data_pkey** (PRIMARY KEY)
  - Column: cust_session
  - References: cpt_data(cust_session)
- **cpt_data_pkey** (PRIMARY KEY)
  - Column: cust_session
  - References: cpt_data(transaction_date)

### cpt_site_accounts

- **2200_42523_1_not_null** (CHECK)
- **2200_42523_2_not_null** (CHECK)
- **2200_42523_4_not_null** (CHECK)
- **cpt_site_accounts_pkey** (PRIMARY KEY)
  - Column: site_id
  - References: cpt_site_accounts(site_id)
- **cpt_site_accounts_account_identifier_key** (UNIQUE)
  - Column: account_identifier
  - References: cpt_site_accounts(account_identifier)

### cpt_sync_log

- **2200_42327_16_not_null** (CHECK)
- **2200_42327_1_not_null** (CHECK)
- **2200_42327_2_not_null** (CHECK)
- **2200_42327_4_not_null** (CHECK)
- **cpt_sync_log_pkey** (PRIMARY KEY)
  - Column: id
  - References: cpt_sync_log(id)

### etransfer_audit_log

- **2200_26593_1_not_null** (CHECK)
- **2200_26593_2_not_null** (CHECK)
- **2200_26593_3_not_null** (CHECK)
- **2200_26593_4_not_null** (CHECK)
- **etransfer_audit_log_created_by_fkey** (FOREIGN KEY)
  - Column: created_by
- **etransfer_audit_log_pkey** (PRIMARY KEY)
  - Column: id
  - References: etransfer_audit_log(id)

### payment_accounts

- **2200_22690_1_not_null** (CHECK)
- **2200_22690_8_not_null** (CHECK)
- **check_secret_key_format** (CHECK)
  - References: payment_accounts(secret_key_name)
- **stripe_accounts_environment_check** (CHECK)
  - References: payment_accounts(environment)
- **payment_accounts_pkey** (PRIMARY KEY)
  - Column: account_id
  - References: payment_accounts(account_id)
- **payment_accounts_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: payment_accounts(payment_provider)
- **payment_accounts_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: payment_accounts(account_id)
- **payment_accounts_pkey** (PRIMARY KEY)
  - Column: account_id
  - References: payment_accounts(payment_provider)

### refund_audit_log

- **2200_23064_1_not_null** (CHECK)
- **2200_23064_2_not_null** (CHECK)
- **2200_23064_3_not_null** (CHECK)
- **2200_23064_5_not_null** (CHECK)
- **refund_audit_log_user_id_fkey** (FOREIGN KEY)
  - Column: user_id
- **refund_audit_log_pkey** (PRIMARY KEY)
  - Column: id
  - References: refund_audit_log(id)

### secret_audit_log

- **2200_25444_1_not_null** (CHECK)
- **2200_25444_2_not_null** (CHECK)
- **2200_25444_3_not_null** (CHECK)
- **secret_audit_log_created_by_fkey** (FOREIGN KEY)
  - Column: created_by
- **secret_audit_log_pkey** (PRIMARY KEY)
  - Column: id
  - References: secret_audit_log(id)

### settlement_adjustments

- **2200_43997_11_not_null** (CHECK)
- **2200_43997_12_not_null** (CHECK)
- **2200_43997_13_not_null** (CHECK)
- **2200_43997_16_not_null** (CHECK)
- **2200_43997_1_not_null** (CHECK)
- **2200_43997_2_not_null** (CHECK)
- **2200_43997_4_not_null** (CHECK)
- **2200_43997_5_not_null** (CHECK)
- **2200_43997_9_not_null** (CHECK)
- **settlement_adjustments_reason_check** (CHECK)
  - References: settlement_adjustments(reason)
- **settlement_adjustments_status_check** (CHECK)
  - References: settlement_adjustments(status)
- **settlement_adjustments_applied_to_settlement_id_fkey** (FOREIGN KEY)
  - Column: applied_to_settlement_id
  - References: settlement_reports(id)
  - On Update: NO ACTION
  - On Delete: NO ACTION
- **settlement_adjustments_original_settlement_report_id_fkey** (FOREIGN KEY)
  - Column: original_settlement_report_id
  - References: settlement_reports(id)
  - On Update: NO ACTION
  - On Delete: NO ACTION
- **settlement_adjustments_pkey** (PRIMARY KEY)
  - Column: id
  - References: settlement_adjustments(id)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: reason
  - References: settlement_adjustments(original_transaction_date)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: original_cust_session
  - References: settlement_adjustments(original_cust_session)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: original_cust_session
  - References: settlement_adjustments(original_transaction_date)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: original_cust_session
  - References: settlement_adjustments(reason)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: original_transaction_date
  - References: settlement_adjustments(original_cust_session)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: original_transaction_date
  - References: settlement_adjustments(original_transaction_date)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: original_transaction_date
  - References: settlement_adjustments(reason)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: reason
  - References: settlement_adjustments(original_cust_session)
- **unique_adjustment_per_transaction** (UNIQUE)
  - Column: reason
  - References: settlement_adjustments(reason)

### settlement_report_items

- **2200_43958_14_not_null** (CHECK)
- **2200_43958_1_not_null** (CHECK)
- **2200_43958_2_not_null** (CHECK)
- **2200_43958_3_not_null** (CHECK)
- **2200_43958_4_not_null** (CHECK)
- **2200_43958_7_not_null** (CHECK)
- **settlement_report_items_settlement_report_id_fkey** (FOREIGN KEY)
  - Column: settlement_report_id
  - References: settlement_reports(id)
  - On Update: NO ACTION
  - On Delete: CASCADE
- **settlement_report_items_pkey** (PRIMARY KEY)
  - Column: id
  - References: settlement_report_items(id)

### settlement_reports

- **2200_43938_10_not_null** (CHECK)
- **2200_43938_13_not_null** (CHECK)
- **2200_43938_15_not_null** (CHECK)
- **2200_43938_1_not_null** (CHECK)
- **2200_43938_2_not_null** (CHECK)
- **2200_43938_3_not_null** (CHECK)
- **2200_43938_5_not_null** (CHECK)
- **2200_43938_6_not_null** (CHECK)
- **2200_43938_7_not_null** (CHECK)
- **2200_43938_8_not_null** (CHECK)
- **2200_43938_9_not_null** (CHECK)
- **settlement_reports_status_check** (CHECK)
  - References: settlement_reports(status)
- **settlement_reports_pkey** (PRIMARY KEY)
  - Column: id
  - References: settlement_reports(id)

### site_pricing

- **2200_44053_1_not_null** (CHECK)
- **2200_44053_2_not_null** (CHECK)
- **2200_44053_4_not_null** (CHECK)
- **2200_44053_5_not_null** (CHECK)
- **2200_44053_6_not_null** (CHECK)
- **2200_44053_7_not_null** (CHECK)
- **2200_44053_8_not_null** (CHECK)
- **2200_44053_9_not_null** (CHECK)
- **site_pricing_gateway_status_check** (CHECK)
  - References: site_pricing(gateway_status)
- **site_pricing_pkey** (PRIMARY KEY)
  - Column: id
  - References: site_pricing(id)
- **site_pricing_site_id_key** (UNIQUE)
  - Column: site_id
  - References: site_pricing(site_id)

### stripe_charges

- **2200_22455_1_not_null** (CHECK)
- **2200_22455_25_not_null** (CHECK)
- **2200_22455_26_not_null** (CHECK)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_charges(stripe_account_id)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_charges(id)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_charges(payment_provider)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_charges(id)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_charges(payment_provider)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_charges(stripe_account_id)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_charges(id)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_charges(payment_provider)
- **stripe_charges_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_charges(stripe_account_id)

### stripe_customers

- **2200_22395_16_not_null** (CHECK)
- **2200_22395_17_not_null** (CHECK)
- **2200_22395_1_not_null** (CHECK)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_customers(stripe_account_id)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_customers(id)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_customers(payment_provider)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_customers(id)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_customers(payment_provider)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_customers(id)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_customers(payment_provider)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_customers(stripe_account_id)
- **stripe_customers_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_customers(stripe_account_id)

### stripe_disputes

- **2200_22492_16_not_null** (CHECK)
- **2200_22492_17_not_null** (CHECK)
- **2200_22492_1_not_null** (CHECK)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_disputes(stripe_account_id)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_disputes(payment_provider)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_disputes(id)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_disputes(stripe_account_id)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_disputes(payment_provider)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_disputes(id)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_disputes(stripe_account_id)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_disputes(payment_provider)
- **stripe_disputes_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_disputes(id)

### stripe_invoices

- **2200_22469_1_not_null** (CHECK)
- **2200_22469_23_not_null** (CHECK)
- **2200_22469_24_not_null** (CHECK)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_invoices(id)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_invoices(id)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_invoices(payment_provider)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_invoices(payment_provider)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_invoices(stripe_account_id)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_invoices(id)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_invoices(payment_provider)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_invoices(stripe_account_id)
- **stripe_invoices_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_invoices(stripe_account_id)

### stripe_payment_intents

- **2200_22441_18_not_null** (CHECK)
- **2200_22441_19_not_null** (CHECK)
- **2200_22441_1_not_null** (CHECK)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_payment_intents(payment_provider)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_payment_intents(id)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_payment_intents(payment_provider)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_payment_intents(stripe_account_id)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_payment_intents(stripe_account_id)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_payment_intents(id)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_payment_intents(payment_provider)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_payment_intents(stripe_account_id)
- **stripe_payment_intents_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_payment_intents(id)

### stripe_prices

- **2200_22413_16_not_null** (CHECK)
- **2200_22413_17_not_null** (CHECK)
- **2200_22413_1_not_null** (CHECK)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_prices(payment_provider)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_prices(stripe_account_id)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_prices(id)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_prices(payment_provider)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_prices(stripe_account_id)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_prices(id)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_prices(payment_provider)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_prices(stripe_account_id)
- **stripe_prices_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_prices(id)

### stripe_products

- **2200_22404_13_not_null** (CHECK)
- **2200_22404_14_not_null** (CHECK)
- **2200_22404_1_not_null** (CHECK)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_products(stripe_account_id)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_products(payment_provider)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_products(id)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_products(payment_provider)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_products(id)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_products(stripe_account_id)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_products(payment_provider)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_products(stripe_account_id)
- **stripe_products_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_products(id)

### stripe_refunds

- **2200_22483_14_not_null** (CHECK)
- **2200_22483_15_not_null** (CHECK)
- **2200_22483_1_not_null** (CHECK)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_refunds(id)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_refunds(id)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_refunds(stripe_account_id)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_refunds(payment_provider)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_refunds(id)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_refunds(stripe_account_id)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_refunds(payment_provider)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_refunds(stripe_account_id)
- **stripe_refunds_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_refunds(payment_provider)

### stripe_subscriptions

- **2200_22427_1_not_null** (CHECK)
- **2200_22427_20_not_null** (CHECK)
- **2200_22427_21_not_null** (CHECK)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_subscriptions(id)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_subscriptions(stripe_account_id)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_subscriptions(id)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_subscriptions(stripe_account_id)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_subscriptions(payment_provider)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_subscriptions(stripe_account_id)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_subscriptions(payment_provider)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_subscriptions(id)
- **stripe_subscriptions_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_subscriptions(payment_provider)

### stripe_sync_status

- **2200_22702_10_not_null** (CHECK)
- **2200_22702_1_not_null** (CHECK)
- **2200_22702_2_not_null** (CHECK)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_sync_status(stripe_account_id)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_sync_status(stripe_account_id)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_sync_status(payment_provider)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: stripe_sync_status(object_type)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_sync_status(payment_provider)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: stripe_sync_status(object_type)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: object_type
  - References: stripe_sync_status(stripe_account_id)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: object_type
  - References: stripe_sync_status(payment_provider)
- **stripe_sync_status_pkey** (PRIMARY KEY)
  - Column: object_type
  - References: stripe_sync_status(object_type)

### stripe_warmup_schedule

- **2200_23174_1_not_null** (CHECK)
- **2200_23174_2_not_null** (CHECK)
- **2200_23174_3_not_null** (CHECK)
- **2200_23174_4_not_null** (CHECK)
- **2200_23174_5_not_null** (CHECK)
- **stripe_warmup_schedule_pkey** (PRIMARY KEY)
  - Column: id
  - References: stripe_warmup_schedule(id)
- **stripe_warmup_schedule_week_number_key** (UNIQUE)
  - Column: week_number
  - References: stripe_warmup_schedule(week_number)

### telegram_sessions

- **2200_19855_1_not_null** (CHECK)
- **2200_19855_2_not_null** (CHECK)
- **2200_19855_3_not_null** (CHECK)
- **2200_19855_6_not_null** (CHECK)
- **2200_19855_7_not_null** (CHECK)
- **telegram_sessions_supabase_user_id_fkey** (FOREIGN KEY)
  - Column: supabase_user_id
- **telegram_sessions_pkey** (PRIMARY KEY)
  - Column: telegram_chat_id
  - References: telegram_sessions(telegram_chat_id)

### user_cpt_site_access

- **2200_42539_1_not_null** (CHECK)
- **2200_42539_2_not_null** (CHECK)
- **user_cpt_site_access_site_id_fkey** (FOREIGN KEY)
  - Column: site_id
  - References: cpt_site_accounts(site_id)
  - On Update: NO ACTION
  - On Delete: CASCADE
- **user_cpt_site_access_user_id_fkey** (FOREIGN KEY)
  - Column: user_id
- **user_cpt_site_access_pkey** (PRIMARY KEY)
  - Column: site_id
  - References: user_cpt_site_access(site_id)
- **user_cpt_site_access_pkey** (PRIMARY KEY)
  - Column: user_id
  - References: user_cpt_site_access(user_id)
- **user_cpt_site_access_pkey** (PRIMARY KEY)
  - Column: site_id
  - References: user_cpt_site_access(user_id)
- **user_cpt_site_access_pkey** (PRIMARY KEY)
  - Column: user_id
  - References: user_cpt_site_access(site_id)

### user_stripe_accounts

- **2200_22728_1_not_null** (CHECK)
- **2200_22728_2_not_null** (CHECK)
- **2200_22728_5_not_null** (CHECK)
- **user_stripe_accounts_role_check** (CHECK)
  - References: user_stripe_accounts(role)
- **user_stripe_accounts_account_fkey** (FOREIGN KEY)
  - Column: stripe_account_id
  - References: payment_accounts(payment_provider)
  - On Update: NO ACTION
  - On Delete: NO ACTION
- **user_stripe_accounts_account_fkey** (FOREIGN KEY)
  - Column: stripe_account_id
  - References: payment_accounts(account_id)
  - On Update: NO ACTION
  - On Delete: NO ACTION
- **user_stripe_accounts_account_fkey** (FOREIGN KEY)
  - Column: payment_provider
  - References: payment_accounts(account_id)
  - On Update: NO ACTION
  - On Delete: NO ACTION
- **user_stripe_accounts_account_fkey** (FOREIGN KEY)
  - Column: payment_provider
  - References: payment_accounts(payment_provider)
  - On Update: NO ACTION
  - On Delete: NO ACTION
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: user_stripe_accounts(user_id)
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: user_stripe_accounts(stripe_account_id)
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: user_stripe_accounts(stripe_account_id)
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: user_id
  - References: user_stripe_accounts(user_id)
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: user_stripe_accounts(payment_provider)
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: stripe_account_id
  - References: user_stripe_accounts(user_id)
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: payment_provider
  - References: user_stripe_accounts(payment_provider)
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: user_id
  - References: user_stripe_accounts(payment_provider)
- **user_stripe_accounts_pkey** (PRIMARY KEY)
  - Column: user_id
  - References: user_stripe_accounts(stripe_account_id)

### user_stripe_keys

- **2200_21155_1_not_null** (CHECK)
- **2200_21155_3_not_null** (CHECK)
- **user_stripe_keys_provider_check** (CHECK)
  - References: user_stripe_keys(key_issuer)
- **user_stripe_keys_supabase_user_id_fkey** (FOREIGN KEY)
  - Column: supabase_user_id
- **user_stripe_keys_pkey** (PRIMARY KEY)
  - Column: id
  - References: user_stripe_keys(id)

## 📇 Indexes

### cpt_data

- **cpt_data_pkey**
  ```sql
  CREATE UNIQUE INDEX cpt_data_pkey ON public.cpt_data USING btree (cust_session, transaction_date)
  ```
- **idx_cpt_data_chargeback**
  ```sql
  CREATE INDEX idx_cpt_data_chargeback ON public.cpt_data USING btree (is_chargeback) WHERE (is_chargeback = true)
  ```
- **idx_cpt_data_email**
  ```sql
  CREATE INDEX idx_cpt_data_email ON public.cpt_data USING btree (cust_email_ad) WHERE (cust_email_ad IS NOT NULL)
  ```
- **idx_cpt_data_refund**
  ```sql
  CREATE INDEX idx_cpt_data_refund ON public.cpt_data USING btree (is_refund) WHERE (is_refund = true)
  ```
- **idx_cpt_data_session**
  ```sql
  CREATE INDEX idx_cpt_data_session ON public.cpt_data USING btree (cust_session)
  ```
- **idx_cpt_data_settled**
  ```sql
  CREATE INDEX idx_cpt_data_settled ON public.cpt_data USING btree (is_settled) WHERE (is_settled = false)
  ```
- **idx_cpt_data_site**
  ```sql
  CREATE INDEX idx_cpt_data_site ON public.cpt_data USING btree (site_id, site_name)
  ```
- **idx_cpt_data_site_complete**
  ```sql
  CREATE INDEX idx_cpt_data_site_complete ON public.cpt_data USING btree (site_id, trans_type, transaction_date DESC) WHERE (trans_type = 'complete'::text)
  ```
- **idx_cpt_data_synced_at**
  ```sql
  CREATE INDEX idx_cpt_data_synced_at ON public.cpt_data USING btree (synced_at DESC)
  ```
- **idx_cpt_data_trans_id**
  ```sql
  CREATE INDEX idx_cpt_data_trans_id ON public.cpt_data USING btree (cust_trans_id) WHERE (cust_trans_id IS NOT NULL)
  ```
- **idx_cpt_data_trans_id_unique**
  ```sql
  CREATE UNIQUE INDEX idx_cpt_data_trans_id_unique ON public.cpt_data USING btree (cust_trans_id) WHERE ((cust_trans_id IS NOT NULL) AND (cust_trans_id <> ''::text))
  ```
- **idx_cpt_data_trans_type**
  ```sql
  CREATE INDEX idx_cpt_data_trans_type ON public.cpt_data USING btree (trans_type, transaction_date DESC)
  ```
- **idx_cpt_data_transaction_date**
  ```sql
  CREATE INDEX idx_cpt_data_transaction_date ON public.cpt_data USING btree (transaction_date DESC)
  ```

### cpt_site_accounts

- **cpt_site_accounts_account_identifier_key**
  ```sql
  CREATE UNIQUE INDEX cpt_site_accounts_account_identifier_key ON public.cpt_site_accounts USING btree (account_identifier)
  ```
- **cpt_site_accounts_pkey**
  ```sql
  CREATE UNIQUE INDEX cpt_site_accounts_pkey ON public.cpt_site_accounts USING btree (site_id)
  ```
- **idx_cpt_site_accounts_active**
  ```sql
  CREATE INDEX idx_cpt_site_accounts_active ON public.cpt_site_accounts USING btree (is_active) WHERE (is_active = true)
  ```
- **idx_cpt_site_accounts_identifier**
  ```sql
  CREATE INDEX idx_cpt_site_accounts_identifier ON public.cpt_site_accounts USING btree (account_identifier)
  ```

### cpt_sync_log

- **cpt_sync_log_pkey**
  ```sql
  CREATE UNIQUE INDEX cpt_sync_log_pkey ON public.cpt_sync_log USING btree (id)
  ```
- **idx_cpt_sync_log_started**
  ```sql
  CREATE INDEX idx_cpt_sync_log_started ON public.cpt_sync_log USING btree (sync_started_at DESC)
  ```
- **idx_cpt_sync_log_status**
  ```sql
  CREATE INDEX idx_cpt_sync_log_status ON public.cpt_sync_log USING btree (status, sync_started_at DESC)
  ```

### etransfer_audit_log

- **etransfer_audit_log_pkey**
  ```sql
  CREATE UNIQUE INDEX etransfer_audit_log_pkey ON public.etransfer_audit_log USING btree (id)
  ```
- **idx_etransfer_audit_account**
  ```sql
  CREATE INDEX idx_etransfer_audit_account ON public.etransfer_audit_log USING btree (account_id)
  ```
- **idx_etransfer_audit_created_at**
  ```sql
  CREATE INDEX idx_etransfer_audit_created_at ON public.etransfer_audit_log USING btree (created_at DESC)
  ```
- **idx_etransfer_audit_created_by**
  ```sql
  CREATE INDEX idx_etransfer_audit_created_by ON public.etransfer_audit_log USING btree (created_by)
  ```
- **idx_etransfer_audit_payout**
  ```sql
  CREATE INDEX idx_etransfer_audit_payout ON public.etransfer_audit_log USING btree (payout_id)
  ```

### payment_accounts

- **idx_payment_accounts_secret_key**
  ```sql
  CREATE INDEX idx_payment_accounts_secret_key ON public.payment_accounts USING btree (secret_key_name)
  ```
- **idx_payment_accounts_site_id**
  ```sql
  CREATE INDEX idx_payment_accounts_site_id ON public.payment_accounts USING btree (site_id)
  ```
- **idx_payment_accounts_warmup_date**
  ```sql
  CREATE INDEX idx_payment_accounts_warmup_date ON public.payment_accounts USING btree (warmup_start_date) WHERE (warmup_start_date IS NOT NULL)
  ```
- **payment_accounts_pkey**
  ```sql
  CREATE UNIQUE INDEX payment_accounts_pkey ON public.payment_accounts USING btree (account_id, payment_provider)
  ```

### refund_audit_log

- **idx_refund_audit_log_action**
  ```sql
  CREATE INDEX idx_refund_audit_log_action ON public.refund_audit_log USING btree (action)
  ```
- **idx_refund_audit_log_created_at**
  ```sql
  CREATE INDEX idx_refund_audit_log_created_at ON public.refund_audit_log USING btree (created_at DESC)
  ```
- **idx_refund_audit_log_user_id**
  ```sql
  CREATE INDEX idx_refund_audit_log_user_id ON public.refund_audit_log USING btree (user_id)
  ```
- **refund_audit_log_pkey**
  ```sql
  CREATE UNIQUE INDEX refund_audit_log_pkey ON public.refund_audit_log USING btree (id)
  ```

### secret_audit_log

- **secret_audit_log_pkey**
  ```sql
  CREATE UNIQUE INDEX secret_audit_log_pkey ON public.secret_audit_log USING btree (id)
  ```

### settlement_adjustments

- **idx_adjustments_applied_report**
  ```sql
  CREATE INDEX idx_adjustments_applied_report ON public.settlement_adjustments USING btree (applied_to_settlement_id)
  ```
- **idx_adjustments_original_report**
  ```sql
  CREATE INDEX idx_adjustments_original_report ON public.settlement_adjustments USING btree (original_settlement_report_id)
  ```
- **idx_adjustments_site**
  ```sql
  CREATE INDEX idx_adjustments_site ON public.settlement_adjustments USING btree (site_id)
  ```
- **idx_adjustments_status**
  ```sql
  CREATE INDEX idx_adjustments_status ON public.settlement_adjustments USING btree (status) WHERE (status = 'pending'::text)
  ```
- **settlement_adjustments_pkey**
  ```sql
  CREATE UNIQUE INDEX settlement_adjustments_pkey ON public.settlement_adjustments USING btree (id)
  ```
- **unique_adjustment_per_transaction**
  ```sql
  CREATE UNIQUE INDEX unique_adjustment_per_transaction ON public.settlement_adjustments USING btree (original_cust_session, original_transaction_date, reason)
  ```

### settlement_report_items

- **idx_settlement_items_report**
  ```sql
  CREATE INDEX idx_settlement_items_report ON public.settlement_report_items USING btree (settlement_report_id)
  ```
- **idx_settlement_items_session**
  ```sql
  CREATE INDEX idx_settlement_items_session ON public.settlement_report_items USING btree (cust_session, transaction_date)
  ```
- **settlement_report_items_pkey**
  ```sql
  CREATE UNIQUE INDEX settlement_report_items_pkey ON public.settlement_report_items USING btree (id)
  ```

### settlement_reports

- **idx_settlement_reports_created**
  ```sql
  CREATE INDEX idx_settlement_reports_created ON public.settlement_reports USING btree (created_at DESC)
  ```
- **idx_settlement_reports_number**
  ```sql
  CREATE UNIQUE INDEX idx_settlement_reports_number ON public.settlement_reports USING btree (report_number)
  ```
- **idx_settlement_reports_site**
  ```sql
  CREATE INDEX idx_settlement_reports_site ON public.settlement_reports USING btree (site_id)
  ```
- **idx_settlement_reports_status**
  ```sql
  CREATE INDEX idx_settlement_reports_status ON public.settlement_reports USING btree (status)
  ```
- **settlement_reports_pkey**
  ```sql
  CREATE UNIQUE INDEX settlement_reports_pkey ON public.settlement_reports USING btree (id)
  ```

### site_pricing

- **idx_site_pricing_site_id**
  ```sql
  CREATE INDEX idx_site_pricing_site_id ON public.site_pricing USING btree (site_id)
  ```
- **site_pricing_pkey**
  ```sql
  CREATE UNIQUE INDEX site_pricing_pkey ON public.site_pricing USING btree (id)
  ```
- **site_pricing_site_id_key**
  ```sql
  CREATE UNIQUE INDEX site_pricing_site_id_key ON public.site_pricing USING btree (site_id)
  ```

### stripe_charges

- **idx_charges_account**
  ```sql
  CREATE INDEX idx_charges_account ON public.stripe_charges USING btree (stripe_account_id)
  ```
- **idx_charges_customer**
  ```sql
  CREATE INDEX idx_charges_customer ON public.stripe_charges USING btree (customer)
  ```
- **idx_charges_paid_provider**
  ```sql
  CREATE INDEX idx_charges_paid_provider ON public.stripe_charges USING btree (payment_provider, paid, created DESC) WHERE (paid = true)
  ```
- **idx_charges_provider**
  ```sql
  CREATE INDEX idx_charges_provider ON public.stripe_charges USING btree (payment_provider)
  ```
- **idx_charges_receipt_email**
  ```sql
  CREATE INDEX idx_charges_receipt_email ON public.stripe_charges USING btree (receipt_email) WHERE (receipt_email IS NOT NULL)
  ```
- **stripe_charges_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_charges_pkey ON public.stripe_charges USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_customers

- **idx_customers_account**
  ```sql
  CREATE INDEX idx_customers_account ON public.stripe_customers USING btree (stripe_account_id)
  ```
- **idx_customers_created**
  ```sql
  CREATE INDEX idx_customers_created ON public.stripe_customers USING btree (created)
  ```
- **idx_customers_email**
  ```sql
  CREATE INDEX idx_customers_email ON public.stripe_customers USING btree (email)
  ```
- **idx_customers_provider**
  ```sql
  CREATE INDEX idx_customers_provider ON public.stripe_customers USING btree (payment_provider)
  ```
- **stripe_customers_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_customers_pkey ON public.stripe_customers USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_disputes

- **idx_disputes_account**
  ```sql
  CREATE INDEX idx_disputes_account ON public.stripe_disputes USING btree (stripe_account_id)
  ```
- **idx_disputes_charge**
  ```sql
  CREATE INDEX idx_disputes_charge ON public.stripe_disputes USING btree (charge)
  ```
- **idx_disputes_provider**
  ```sql
  CREATE INDEX idx_disputes_provider ON public.stripe_disputes USING btree (payment_provider)
  ```
- **stripe_disputes_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_disputes_pkey ON public.stripe_disputes USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_invoices

- **idx_invoices_account**
  ```sql
  CREATE INDEX idx_invoices_account ON public.stripe_invoices USING btree (stripe_account_id)
  ```
- **idx_invoices_customer**
  ```sql
  CREATE INDEX idx_invoices_customer ON public.stripe_invoices USING btree (customer)
  ```
- **idx_invoices_provider**
  ```sql
  CREATE INDEX idx_invoices_provider ON public.stripe_invoices USING btree (payment_provider)
  ```
- **idx_invoices_subscription**
  ```sql
  CREATE INDEX idx_invoices_subscription ON public.stripe_invoices USING btree (subscription)
  ```
- **stripe_invoices_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_invoices_pkey ON public.stripe_invoices USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_payment_intents

- **idx_payment_intents_account**
  ```sql
  CREATE INDEX idx_payment_intents_account ON public.stripe_payment_intents USING btree (stripe_account_id)
  ```
- **idx_payment_intents_customer**
  ```sql
  CREATE INDEX idx_payment_intents_customer ON public.stripe_payment_intents USING btree (customer)
  ```
- **idx_payment_intents_provider**
  ```sql
  CREATE INDEX idx_payment_intents_provider ON public.stripe_payment_intents USING btree (payment_provider)
  ```
- **idx_payment_intents_status**
  ```sql
  CREATE INDEX idx_payment_intents_status ON public.stripe_payment_intents USING btree (status)
  ```
- **stripe_payment_intents_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_payment_intents_pkey ON public.stripe_payment_intents USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_prices

- **idx_prices_account**
  ```sql
  CREATE INDEX idx_prices_account ON public.stripe_prices USING btree (stripe_account_id)
  ```
- **idx_prices_provider**
  ```sql
  CREATE INDEX idx_prices_provider ON public.stripe_prices USING btree (payment_provider)
  ```
- **stripe_prices_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_prices_pkey ON public.stripe_prices USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_products

- **idx_products_account**
  ```sql
  CREATE INDEX idx_products_account ON public.stripe_products USING btree (stripe_account_id)
  ```
- **idx_products_provider**
  ```sql
  CREATE INDEX idx_products_provider ON public.stripe_products USING btree (payment_provider)
  ```
- **stripe_products_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_products_pkey ON public.stripe_products USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_refunds

- **idx_refunds_account**
  ```sql
  CREATE INDEX idx_refunds_account ON public.stripe_refunds USING btree (stripe_account_id)
  ```
- **idx_refunds_charge**
  ```sql
  CREATE INDEX idx_refunds_charge ON public.stripe_refunds USING btree (charge)
  ```
- **idx_refunds_provider**
  ```sql
  CREATE INDEX idx_refunds_provider ON public.stripe_refunds USING btree (payment_provider)
  ```
- **stripe_refunds_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_refunds_pkey ON public.stripe_refunds USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_subscriptions

- **idx_subscriptions_account**
  ```sql
  CREATE INDEX idx_subscriptions_account ON public.stripe_subscriptions USING btree (stripe_account_id)
  ```
- **idx_subscriptions_customer**
  ```sql
  CREATE INDEX idx_subscriptions_customer ON public.stripe_subscriptions USING btree (customer)
  ```
- **idx_subscriptions_provider**
  ```sql
  CREATE INDEX idx_subscriptions_provider ON public.stripe_subscriptions USING btree (payment_provider)
  ```
- **idx_subscriptions_status**
  ```sql
  CREATE INDEX idx_subscriptions_status ON public.stripe_subscriptions USING btree (status)
  ```
- **stripe_subscriptions_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_subscriptions_pkey ON public.stripe_subscriptions USING btree (id, stripe_account_id, payment_provider)
  ```

### stripe_sync_status

- **stripe_sync_status_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_sync_status_pkey ON public.stripe_sync_status USING btree (object_type, stripe_account_id, payment_provider)
  ```

### stripe_warmup_schedule

- **idx_stripe_warmup_schedule_week**
  ```sql
  CREATE INDEX idx_stripe_warmup_schedule_week ON public.stripe_warmup_schedule USING btree (week_number)
  ```
- **stripe_warmup_schedule_pkey**
  ```sql
  CREATE UNIQUE INDEX stripe_warmup_schedule_pkey ON public.stripe_warmup_schedule USING btree (id)
  ```
- **stripe_warmup_schedule_week_number_key**
  ```sql
  CREATE UNIQUE INDEX stripe_warmup_schedule_week_number_key ON public.stripe_warmup_schedule USING btree (week_number)
  ```

### telegram_sessions

- **idx_telegram_chat_id**
  ```sql
  CREATE INDEX idx_telegram_chat_id ON public.telegram_sessions USING btree (telegram_chat_id)
  ```
- **telegram_sessions_pkey**
  ```sql
  CREATE UNIQUE INDEX telegram_sessions_pkey ON public.telegram_sessions USING btree (telegram_chat_id)
  ```

### user_cpt_site_access

- **idx_user_cpt_site_access_site**
  ```sql
  CREATE INDEX idx_user_cpt_site_access_site ON public.user_cpt_site_access USING btree (site_id)
  ```
- **idx_user_cpt_site_access_user**
  ```sql
  CREATE INDEX idx_user_cpt_site_access_user ON public.user_cpt_site_access USING btree (user_id)
  ```
- **user_cpt_site_access_pkey**
  ```sql
  CREATE UNIQUE INDEX user_cpt_site_access_pkey ON public.user_cpt_site_access USING btree (user_id, site_id)
  ```

### user_stripe_accounts

- **user_stripe_accounts_pkey**
  ```sql
  CREATE UNIQUE INDEX user_stripe_accounts_pkey ON public.user_stripe_accounts USING btree (user_id, stripe_account_id, payment_provider)
  ```

### user_stripe_keys

- **idx_user_stripe_keys_email**
  ```sql
  CREATE INDEX idx_user_stripe_keys_email ON public.user_stripe_keys USING btree (lower(email))
  ```
- **user_stripe_keys_pkey**
  ```sql
  CREATE UNIQUE INDEX user_stripe_keys_pkey ON public.user_stripe_keys USING btree (id)
  ```

## 🔒 Row Level Security Policies

### cpt_data

#### Allow authenticated users to read CPT data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to cpt_data

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`

#### cpt_data_select_policy

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### cpt_data_update_policy

- **Command:** UPDATE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

### cpt_site_accounts

#### Authenticated users can read active accounts

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `(is_active = true)`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

### cpt_sync_log

#### Allow admins full access to cpt_sync_log

- **Command:** ALL
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `(EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND (((users.raw_user_meta_data ->> 'role'::text) = 'admin'::text) OR ((users.raw_app_meta_data ->> 'role'::text) = 'admin'::text)))))`

#### Allow service role full access to cpt_sync_log

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`

#### cpt_sync_log_insert

- **Command:** INSERT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **WITH CHECK:** `true`

#### cpt_sync_log_select

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

### etransfer_audit_log

#### Admins can update etransfer logs

- **Command:** UPDATE
- **Roles:** public
- **Type:** PERMISSIVE
- **USING:** `(EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND (((users.raw_user_meta_data ->> 'role'::text) = 'admin'::text) OR ((users.raw_app_meta_data ->> 'role'::text) = 'admin'::text)))))`

#### Admins can view etransfer logs

- **Command:** SELECT
- **Roles:** public
- **Type:** PERMISSIVE
- **USING:** `(EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND (((users.raw_user_meta_data ->> 'role'::text) = 'admin'::text) OR ((users.raw_app_meta_data ->> 'role'::text) = 'admin'::text)))))`

#### System can insert etransfer logs

- **Command:** INSERT
- **Roles:** public
- **Type:** PERMISSIVE
- **WITH CHECK:** `true`

### payment_accounts

#### Admins can delete payment accounts

- **Command:** DELETE
- **Roles:** public
- **Type:** PERMISSIVE
- **USING:** `is_admin()`

#### Admins can insert payment accounts

- **Command:** INSERT
- **Roles:** public
- **Type:** PERMISSIVE
- **WITH CHECK:** `is_admin()`

#### Admins can update payment accounts

- **Command:** UPDATE
- **Roles:** public
- **Type:** PERMISSIVE
- **USING:** `is_admin()`

#### Allow authenticated users to read payment_accounts

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow authenticated users to update payment accounts

- **Command:** UPDATE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `(EXISTS ( SELECT 1
   FROM user_stripe_accounts
  WHERE ((user_stripe_accounts.stripe_account_id = payment_accounts.account_id) AND (user_stripe_accounts.payment_provider = payment_accounts.payment_provider) AND (user_stripe_accounts.user_id = auth.uid()))))`
- **WITH CHECK:** `(EXISTS ( SELECT 1
   FROM user_stripe_accounts
  WHERE ((user_stripe_accounts.stripe_account_id = payment_accounts.account_id) AND (user_stripe_accounts.payment_provider = payment_accounts.payment_provider) AND (user_stripe_accounts.user_id = auth.uid()))))`

#### Service role full access to accounts

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read accounts they have access to

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### refund_audit_log

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can view their own audit logs

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `(auth.uid() = user_id)`

### secret_audit_log

#### Admins can view audit log

- **Command:** SELECT
- **Roles:** public
- **Type:** PERMISSIVE
- **USING:** `(EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND (((users.raw_user_meta_data ->> 'role'::text) = 'admin'::text) OR ((users.raw_app_meta_data ->> 'role'::text) = 'admin'::text)))))`

### settlement_adjustments

#### adjustments_delete

- **Command:** DELETE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### adjustments_insert

- **Command:** INSERT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **WITH CHECK:** `true`

#### adjustments_select

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### adjustments_update

- **Command:** UPDATE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

### settlement_report_items

#### settlement_items_delete

- **Command:** DELETE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### settlement_items_insert

- **Command:** INSERT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **WITH CHECK:** `true`

#### settlement_items_select

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

### settlement_reports

#### settlement_reports_delete

- **Command:** DELETE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### settlement_reports_insert

- **Command:** INSERT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **WITH CHECK:** `true`

#### settlement_reports_select

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### settlement_reports_update

- **Command:** UPDATE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

### site_pricing

#### site_pricing_delete

- **Command:** DELETE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### site_pricing_insert

- **Command:** INSERT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **WITH CHECK:** `true`

#### site_pricing_select

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### site_pricing_update

- **Command:** UPDATE
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

### stripe_charges

#### Allow authenticated users to read charges

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow authenticated users to read stripe_charges

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to charges

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_customers

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_disputes

#### Allow authenticated users to read disputes

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow authenticated users to read stripe_disputes

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to disputes

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_invoices

#### Allow authenticated users to read invoices

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to invoices

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_payment_intents

#### Allow authenticated users to read payment intents

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to payment intents

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_prices

#### Allow authenticated users to read prices

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to prices

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_products

#### Allow authenticated users to read products

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to products

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_refunds

#### Allow authenticated users to read refunds

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow authenticated users to read stripe_refunds

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to refunds

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_subscriptions

#### Allow authenticated users to read subscriptions

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Allow service role full access to subscriptions

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their assigned accounts' data

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `((stripe_account_id, payment_provider) IN ( SELECT user_stripe_accounts.stripe_account_id,
    user_stripe_accounts.payment_provider
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_sync_status

#### Service role full access to sync status

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read sync status for their accounts

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `(stripe_account_id IN ( SELECT user_stripe_accounts.stripe_account_id
   FROM user_stripe_accounts
  WHERE (user_stripe_accounts.user_id = auth.uid())))`

### stripe_warmup_schedule

#### Authenticated users can read warmup schedule

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `true`

#### Service role full access to warmup schedule

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

### telegram_sessions

#### Users can manage their own Telegram session

- **Command:** ALL
- **Roles:** public
- **Type:** PERMISSIVE
- **USING:** `(auth.uid() = supabase_user_id)`
- **WITH CHECK:** `(auth.uid() = supabase_user_id)`

### user_cpt_site_access

#### Service role full access

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can see their own access

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `(auth.uid() = user_id)`

### user_stripe_accounts

#### Service role full access to user accounts

- **Command:** ALL
- **Roles:** service_role
- **Type:** PERMISSIVE
- **USING:** `true`
- **WITH CHECK:** `true`

#### Users can read their own account assignments

- **Command:** SELECT
- **Roles:** authenticated
- **Type:** PERMISSIVE
- **USING:** `(user_id = auth.uid())`

### user_stripe_keys

#### Users can manage their own Stripe keys

- **Command:** ALL
- **Roles:** public
- **Type:** PERMISSIVE
- **USING:** `((auth.uid() = supabase_user_id) OR (lower(email) = lower((( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text)))`
- **WITH CHECK:** `((auth.uid() = supabase_user_id) OR (lower(email) = lower((( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text)))`

## ⚙️ Functions

### check_duplicates

**Returns:** setof record
**Language:** plpgsql
**Arguments:** none

### cpt_check_duplicates

**Returns:** setof record
**Language:** plpgsql
**Arguments:** none

### cpt_detect_missing_syncs

**Returns:** setof record
**Language:** plpgsql
**Arguments:** none

### cpt_latest_sync_status

**Returns:** setof record
**Language:** plpgsql
**Arguments:** none

### generate_settlement_report_number

**Returns:** text
**Language:** plpgsql
**Arguments:** none

### get_constraints

**Returns:** jsonb
**Language:** plpgsql
**Arguments:** none

### get_database_functions

**Returns:** jsonb
**Language:** plpgsql
**Arguments:** none

### get_extensions

**Returns:** jsonb
**Language:** plpgsql
**Arguments:** none

### get_indexes

**Returns:** jsonb
**Language:** plpgsql
**Arguments:** none

### get_rls_policies

**Returns:** jsonb
**Language:** plpgsql
**Arguments:** none

### get_table_structures

**Returns:** jsonb
**Language:** plpgsql
**Arguments:** none

### get_user_cpt_sites

**Returns:** setof record
**Language:** sql
**Arguments:** p_user_id uuid

### grant_all_account_access_to_user

**Returns:** void
**Language:** plpgsql
**Arguments:** user_email text

### grant_user_cpt_site_access

**Returns:** setof record
**Language:** plpgsql
**Arguments:** p_user_id uuid, p_site_ids text[]

### is_admin

**Returns:** boolean
**Language:** plpgsql
**Arguments:** none

### report_weekly_charges

**Returns:** setof record
**Language:** sql
**Arguments:** year integer, month integer

### update_cpt_data_updated_at

**Returns:** trigger
**Language:** plpgsql
**Arguments:** none

### update_site_pricing_updated_at

**Returns:** trigger
**Language:** plpgsql
**Arguments:** none

### update_sync_status

**Returns:** void
**Language:** plpgsql
**Arguments:** p_object_type text, p_status text, p_last_sync_id text DEFAULT NULL::text, p_total_synced integer DEFAULT NULL::integer, p_error_message text DEFAULT NULL::text

### update_sync_status_for_account

**Returns:** void
**Language:** plpgsql
**Arguments:** p_object_type text, p_stripe_account_id text, p_status text, p_payment_provider text DEFAULT 'stripe'::text, p_last_sync_id text DEFAULT NULL::text, p_total_synced integer DEFAULT NULL::integer, p_error_message text DEFAULT NULL::text

### update_sync_status_for_account

**Returns:** void
**Language:** plpgsql
**Arguments:** p_object_type text, p_stripe_account_id text, p_status text, p_last_sync_id text DEFAULT NULL::text, p_total_synced integer DEFAULT NULL::integer, p_error_message text DEFAULT NULL::text

### update_updated_at_column

**Returns:** trigger
**Language:** plpgsql
**Arguments:** none

## 👁️ Views

- **all_customers** - 359 records
- **all_charges** - 437 records
- **revenue_by_provider** - 8 records
- **stripe_customers_by_account** - 6 records
- **stripe_revenue_by_account** - 8 records
- **stripe_subscriptions_by_account** - 0 records

## 🏦 Payment Accounts

- **airwallex** - 0f2e5c4f (live) - Key: AIRWALLEX_ACCOUNT_1_KEY
- **airwallex** - adbafa14 (live) - Key: AIRWALLEX_ACCOUNT_2_KEY
- **airwallex** - 500de8a1 (live) - Key: AIRWALLEX_ACCOUNT_3_KEY
- **stripe** - 33d86bf1 (live) - Key: STRIPE_ACCOUNT_2_KEY
- **stripe** - 9ac7b070 (live) - Key: STRIPE_ACCOUNT_4_KEY - Warmup: 2025-12-17
- **stripe** - 1cb1e27f (live) - Key: STRIPE_ACCOUNT_1_KEY - Warmup: 2025-09-05
- **stripe** - 343fd961 (live) - Key: STRIPE_ACCOUNT_5_KEY - Warmup: 2025-12-17
- **stripe** - b8a82ca9 (live) - Key: STRIPE_ACCOUNT_6_KEY
- **stripe** - 0a7ea0c6 (test) - Key: STRIPE_ACCOUNT_3_KEY

## 🔄 Sync Status

| Object Type | Provider | Account | Status | Last Sync | Total |
|-------------|----------|---------|--------|-----------|-------|
| customers | airwallex | 1cb1e27f | pending | Never | 0 |
| invoices | stripe | 1cb1e27f | completed | Never | 0 |
| refunds | stripe | 1cb1e27f | completed | Never | 0 |
| disputes | stripe | 1cb1e27f | completed | Never | 0 |
| payment_intents | stripe | 1cb1e27f | completed | Never | 0 |
| payment_intents | airwallex | 1cb1e27f | pending | Never | 0 |
| refunds | airwallex | 1cb1e27f | pending | Never | 0 |
| charges | airwallex | 1cb1e27f | pending | Never | 0 |
| refunds | airwallex | 0f2e5c4f | completed | 2025-12-23T17:40:38.379249+00:00 | 0 |
| payment_intents | airwallex | 0f2e5c4f | completed | 2025-12-23T17:40:37.924794+00:00 | 25 |
| customers | airwallex | 0f2e5c4f | completed | 2025-12-23T17:40:32.912748+00:00 | 0 |
| charges | stripe | 33d86bf1 | completed | 2025-12-23T17:01:56.100643+00:00 | 76 |
| subscriptions | stripe | 33d86bf1 | completed | 2025-12-23T17:01:40.58929+00:00 | 0 |
| prices | stripe | 33d86bf1 | completed | 2025-12-23T17:01:40.210718+00:00 | 1 |
| products | stripe | 33d86bf1 | completed | 2025-12-23T17:01:39.62934+00:00 | 1 |
| customers | stripe | 33d86bf1 | completed | 2025-12-23T17:01:39.053968+00:00 | 82 |
| charges | stripe | 1cb1e27f | completed | 2025-12-23T17:01:24.114597+00:00 | 243 |
| subscriptions | stripe | 1cb1e27f | completed | 2025-12-23T17:00:29.556785+00:00 | 0 |
| prices | stripe | 1cb1e27f | completed | 2025-12-23T17:00:29.127475+00:00 | 2 |
| products | stripe | 1cb1e27f | completed | 2025-12-23T17:00:28.222197+00:00 | 2 |
| customers | stripe | 1cb1e27f | completed | 2025-12-23T17:00:27.388175+00:00 | 140 |

---

*Complete schema export for Claude Projects*
