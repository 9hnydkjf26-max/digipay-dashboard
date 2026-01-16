# DigiPay Dashboard

## Project Overview

DigiPay Dashboard is a multi-tenant payment management system for merchants. It provides transaction reporting, refund management, balance tracking, and compliance monitoring across multiple payment processors (Stripe, Airwallex).

**Live URL:** Hosted on GitHub Pages
**Backend:** Supabase (PostgreSQL + Edge Functions)
**Gateway:** secure.digipay.co (whitelabel 3rd-party gateway)

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JavaScript (no frameworks)
- **Backend:** Supabase (PostgreSQL, Edge Functions, Auth)
- **Payment Processors:** Stripe, Airwallex
- **Plugin:** WooCommerce payment gateway plugin (PHP)
- **Hosting:** GitHub Pages (static site)

## Architecture

```
GitHub Pages (Static Dashboard)
        ↓
Supabase (Auth, Database, Edge Functions)
        ↓
    ┌───┴───┐
Stripe   Airwallex

WooCommerce Plugin → secure.digipay.co (Gateway) → Hosted Payment Pages
```

## Directory Structure

```
digipay-dashboard/
├── plugin/
│   └── secure_plugin/        # WooCommerce payment gateway plugin
│       ├── woocommerce-gateway-paygo.php  # Main plugin file
│       ├── digipay-diagnostics.php        # Health monitoring
│       ├── class-github-updater.php       # Auto-update from GitHub
│       ├── paygo_postback.php             # Payment callbacks
│       └── inc/                           # Additional modules
├── supabase/
│   └── functions/            # Edge Functions (TypeScript)
│       ├── stripe-webhook/   # Stripe event handler
│       ├── airwallex-*/      # Airwallex integrations
│       └── ...
├── config.js                 # Supabase credentials (NOT in git)
├── router.js                 # SPA-like navigation
├── sidebar.js                # Shared navigation component
├── *.html                    # Dashboard pages
└── *.css                     # Stylesheets
```

## Key Files

| File | Purpose |
|------|---------|
| `config.js` | Supabase URL and anon key (create locally, not committed) |
| `router.js` | Client-side navigation without full page reloads |
| `sidebar.js` | Shared sidebar component with role-based visibility |
| `login.html` | Authentication (email/password, invite links) |
| `reports.html` | Transaction analytics and charts |
| `refunds.html` | Refund management interface |
| `admin.html` | Admin-only settings (requires admin role) |
| `warmup.html` | Merchant limit/compliance tracking |
| `balances.html` | Real-time Stripe & Airwallex balances |

## Authentication & Roles

- **Auth Provider:** Supabase Auth (email/password)
- **User Creation:** Manual via Supabase Auth dashboard
- **Roles:**
  - `admin` - Full access including admin.html
  - Regular user - All pages except admin.html
- **Session:** JWT stored in browser, checked on each page load
- **RLS:** Row-Level Security ensures merchants only see their own data

## Payment Flow

1. Customer initiates checkout on WooCommerce store
2. Plugin encrypts transaction data (AES-256-CBC)
3. Data sent to secure.digipay.co (gateway)
4. Gateway redirects customer to hosted payment page (Stripe, etc.)
5. Payment result sent back via postback/webhook
6. Stripe webhooks populate transaction data in Supabase
7. Dashboard displays transaction data with RLS filtering

## Data Sync

- **Primary method:** Stripe webhooks → Edge Function → Database
- **Webhook endpoint:** `/functions/v1/stripe-webhook`
- **Tables:** `stripe_charges`, `stripe_customers`, `stripe_refunds`, `stripe_disputes`, etc.

## Environment

- **Single environment** (no staging/production separation)
- **Config:** `config.js` must be created locally with Supabase credentials
- **Service Key:** Stored in `.env` file (parent directory), used for backend operations

## Plugin (WooCommerce)

**Location:** `plugin/secure_plugin/`
**Current Version:** 12.6.9

- Registers as WooCommerce payment gateway
- Encrypts checkout data before sending to gateway
- Auto-updates from GitHub releases via `class-github-updater.php`
- Includes diagnostics panel for health monitoring

**Encryption:** AES-256-CBC with PBKDF2 key derivation
**Default Key:** `fluidcastplgpaygowoo22` (override in `wp-config.php`)

## Common Tasks

### Adding a new dashboard page
1. Copy `page-template.html`
2. Include `config.js`, `sidebar.js`, `router.js`
3. Call `SidebarComponent.init()` with Supabase client
4. Add navigation entry in `sidebar.js` NAVIGATION_ITEMS array

### Creating releases for the plugin
1. Update version in `woocommerce-gateway-paygo.php`
2. Update `CHANGELOG.md`
3. Commit changes to staging branch
4. Merge to main when ready
5. Create GitHub release with zip file

### Running locally
1. Create `config.js` with Supabase credentials
2. Serve files with any static server (e.g., `npx serve`)
3. Open in browser

## Security Notes

- Never commit `config.js` or `.env` files
- Service role key bypasses RLS - only use server-side
- Plugin encryption key must match gateway configuration
- Admin pages check `user_metadata.role === 'admin'`

## External Services

| Service | Purpose |
|---------|---------|
| Supabase | Database, Auth, Edge Functions |
| Stripe | Payment processing, webhooks |
| Airwallex | Multi-currency payments, e-transfers |
| secure.digipay.co | Payment gateway (whitelabel) |
| GitHub Pages | Dashboard hosting |
