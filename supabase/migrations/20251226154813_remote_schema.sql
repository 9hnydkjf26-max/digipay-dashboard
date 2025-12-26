drop index if exists "public"."idx_payment_accounts_api_key_name";


  create table "public"."etransfer_audit_log" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "account_id" text not null,
    "recipient_email" text not null,
    "amount" numeric(10,2) not null,
    "currency" text default 'CAD'::text,
    "payout_id" text,
    "status" text,
    "created_by" uuid,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "details" jsonb
      );


alter table "public"."etransfer_audit_log" enable row level security;


  create table "public"."secret_audit_log" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "secret_name" text not null,
    "action" text not null,
    "details" text,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid
      );


alter table "public"."secret_audit_log" enable row level security;

alter table "public"."payment_accounts" drop column "api_key_number";

alter table "public"."payment_accounts" add column "secret_key_name" text;

alter table "public"."payment_accounts" add column "warmup_start_date" date;

alter table "public"."payment_accounts" alter column "account_name" drop not null;

CREATE UNIQUE INDEX etransfer_audit_log_pkey ON public.etransfer_audit_log USING btree (id);

CREATE INDEX idx_etransfer_audit_account ON public.etransfer_audit_log USING btree (account_id);

CREATE INDEX idx_etransfer_audit_created_at ON public.etransfer_audit_log USING btree (created_at DESC);

CREATE INDEX idx_etransfer_audit_created_by ON public.etransfer_audit_log USING btree (created_by);

CREATE INDEX idx_etransfer_audit_payout ON public.etransfer_audit_log USING btree (payout_id);

CREATE INDEX idx_payment_accounts_secret_key ON public.payment_accounts USING btree (secret_key_name);

CREATE INDEX idx_payment_accounts_warmup_date ON public.payment_accounts USING btree (warmup_start_date) WHERE (warmup_start_date IS NOT NULL);

CREATE UNIQUE INDEX secret_audit_log_pkey ON public.secret_audit_log USING btree (id);

alter table "public"."etransfer_audit_log" add constraint "etransfer_audit_log_pkey" PRIMARY KEY using index "etransfer_audit_log_pkey";

alter table "public"."secret_audit_log" add constraint "secret_audit_log_pkey" PRIMARY KEY using index "secret_audit_log_pkey";

alter table "public"."etransfer_audit_log" add constraint "etransfer_audit_log_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."etransfer_audit_log" validate constraint "etransfer_audit_log_created_by_fkey";

alter table "public"."payment_accounts" add constraint "check_secret_key_format" CHECK (((secret_key_name IS NULL) OR (secret_key_name ~ '^(STRIPE|AIRWALLEX)_ACCOUNT_[0-9]+_KEY$'::text))) not valid;

alter table "public"."payment_accounts" validate constraint "check_secret_key_format";

alter table "public"."secret_audit_log" add constraint "secret_audit_log_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."secret_audit_log" validate constraint "secret_audit_log_created_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

grant delete on table "public"."etransfer_audit_log" to "anon";

grant insert on table "public"."etransfer_audit_log" to "anon";

grant references on table "public"."etransfer_audit_log" to "anon";

grant select on table "public"."etransfer_audit_log" to "anon";

grant trigger on table "public"."etransfer_audit_log" to "anon";

grant truncate on table "public"."etransfer_audit_log" to "anon";

grant update on table "public"."etransfer_audit_log" to "anon";

grant delete on table "public"."etransfer_audit_log" to "authenticated";

grant insert on table "public"."etransfer_audit_log" to "authenticated";

grant references on table "public"."etransfer_audit_log" to "authenticated";

grant select on table "public"."etransfer_audit_log" to "authenticated";

grant trigger on table "public"."etransfer_audit_log" to "authenticated";

grant truncate on table "public"."etransfer_audit_log" to "authenticated";

grant update on table "public"."etransfer_audit_log" to "authenticated";

grant delete on table "public"."etransfer_audit_log" to "service_role";

grant insert on table "public"."etransfer_audit_log" to "service_role";

grant references on table "public"."etransfer_audit_log" to "service_role";

grant select on table "public"."etransfer_audit_log" to "service_role";

grant trigger on table "public"."etransfer_audit_log" to "service_role";

grant truncate on table "public"."etransfer_audit_log" to "service_role";

grant update on table "public"."etransfer_audit_log" to "service_role";

grant delete on table "public"."secret_audit_log" to "anon";

grant insert on table "public"."secret_audit_log" to "anon";

grant references on table "public"."secret_audit_log" to "anon";

grant select on table "public"."secret_audit_log" to "anon";

grant trigger on table "public"."secret_audit_log" to "anon";

grant truncate on table "public"."secret_audit_log" to "anon";

grant update on table "public"."secret_audit_log" to "anon";

grant delete on table "public"."secret_audit_log" to "authenticated";

grant insert on table "public"."secret_audit_log" to "authenticated";

grant references on table "public"."secret_audit_log" to "authenticated";

grant select on table "public"."secret_audit_log" to "authenticated";

grant trigger on table "public"."secret_audit_log" to "authenticated";

grant truncate on table "public"."secret_audit_log" to "authenticated";

grant update on table "public"."secret_audit_log" to "authenticated";

grant delete on table "public"."secret_audit_log" to "service_role";

grant insert on table "public"."secret_audit_log" to "service_role";

grant references on table "public"."secret_audit_log" to "service_role";

grant select on table "public"."secret_audit_log" to "service_role";

grant trigger on table "public"."secret_audit_log" to "service_role";

grant truncate on table "public"."secret_audit_log" to "service_role";

grant update on table "public"."secret_audit_log" to "service_role";


  create policy "Admins can update etransfer logs"
  on "public"."etransfer_audit_log"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND (((users.raw_user_meta_data ->> 'role'::text) = 'admin'::text) OR ((users.raw_app_meta_data ->> 'role'::text) = 'admin'::text))))));



  create policy "Admins can view etransfer logs"
  on "public"."etransfer_audit_log"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND (((users.raw_user_meta_data ->> 'role'::text) = 'admin'::text) OR ((users.raw_app_meta_data ->> 'role'::text) = 'admin'::text))))));



  create policy "System can insert etransfer logs"
  on "public"."etransfer_audit_log"
  as permissive
  for insert
  to public
with check (true);



  create policy "Admins can delete payment accounts"
  on "public"."payment_accounts"
  as permissive
  for delete
  to public
using (public.is_admin());



  create policy "Admins can insert payment accounts"
  on "public"."payment_accounts"
  as permissive
  for insert
  to public
with check (public.is_admin());



  create policy "Admins can update payment accounts"
  on "public"."payment_accounts"
  as permissive
  for update
  to public
using (public.is_admin());



  create policy "Allow authenticated users to update payment accounts"
  on "public"."payment_accounts"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.user_stripe_accounts
  WHERE ((user_stripe_accounts.stripe_account_id = payment_accounts.account_id) AND (user_stripe_accounts.payment_provider = payment_accounts.payment_provider) AND (user_stripe_accounts.user_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.user_stripe_accounts
  WHERE ((user_stripe_accounts.stripe_account_id = payment_accounts.account_id) AND (user_stripe_accounts.payment_provider = payment_accounts.payment_provider) AND (user_stripe_accounts.user_id = auth.uid())))));



  create policy "Admins can view audit log"
  on "public"."secret_audit_log"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM auth.users
  WHERE ((users.id = auth.uid()) AND (((users.raw_user_meta_data ->> 'role'::text) = 'admin'::text) OR ((users.raw_app_meta_data ->> 'role'::text) = 'admin'::text))))));



