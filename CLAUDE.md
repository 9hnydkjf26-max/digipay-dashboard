# DigiPay Dashboard

## Project Overview

DigiPay Dashboard is a multi-tenant payment management system for merchants. It provides transaction reporting, refund management, balance tracking, and compliance monitoring across multiple payment processors (Stripe, Airwallex).

**Live URL:** Hosted on GitHub Pages
**Backend:** Supabase (PostgreSQL + Edge Functions)
**Gateway:** secure.digipay.co (whitelabel 3rd-party gateway)

## Tech Stack

- **Frontend:** Vue 3 (Composition API) + Vite, with legacy vanilla HTML/CSS/JS pages
- **Backend:** Supabase (PostgreSQL, Edge Functions, Auth)
- **Payment Processors:** Stripe, Airwallex
- **Plugin:** WooCommerce payment gateway plugin (PHP)
- **Hosting:** GitHub Pages (static site)

### Vue App Structure
```
src/
├── views/           # Page components (CptReportsView.vue, SettlementReportsView.vue, etc.)
├── components/      # Reusable components (Sidebar.vue, CustomDropdown.vue, etc.)
├── composables/     # Shared logic (useSupabase.js, useAuth.js, useAlerts.js)
├── assets/styles/   # CSS files (main.css, reports.css)
├── router/          # Vue Router configuration
└── App.vue          # Root component with layout
```

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

### Running Vue app locally
1. `npm install`
2. `npm run dev`
3. Open http://localhost:5173/digipay-dashboard/

## Vue Component Patterns & Layout Shift Prevention

### Page Navigation - Use KeepAlive
Wrap RouterView with `<KeepAlive>` to cache page components. This prevents layout recalculation when navigating between pages.

```vue
<!-- App.vue -->
<RouterView v-slot="{ Component, route: currentRoute }">
  <Transition name="fade" mode="out-in">
    <KeepAlive>
      <component :is="Component" :key="currentRoute.path" />
    </KeepAlive>
  </Transition>
</RouterView>
```

**Why:** Without KeepAlive, components are destroyed and recreated on each navigation, causing visible layout shifts as elements render.

### Tab Panels - Use CSS Grid Stacking
When implementing tabs that show/hide panels, use CSS Grid to stack all panels in the same cell. This ensures all panels contribute to the container's dimensions.

```vue
<template>
  <div class="panels-container">
    <div class="panel" :class="{ 'panel-hidden': activeTab !== 'tab1' }">...</div>
    <div class="panel" :class="{ 'panel-hidden': activeTab !== 'tab2' }">...</div>
    <div class="panel" :class="{ 'panel-hidden': activeTab !== 'tab3' }">...</div>
  </div>
</template>

<style>
.panels-container {
  display: grid;
  grid-template-columns: 1fr;
}

.panels-container > .panel {
  grid-row: 1;
  grid-column: 1;
}

.panel.panel-hidden {
  visibility: hidden;
  pointer-events: none;
  opacity: 0;
}
</style>
```

**Why:** Using `display: none` or `v-if` removes panels from layout flow, causing width/height changes. CSS Grid stacking keeps all panels in the layout.

### Loading/Content States - Use CSS Grid Stacking
When switching between loading, empty, and content states, **never use `v-if`/`v-else`**. This causes layout shifts when DOM elements are added/removed. Instead, use CSS Grid stacking to keep all states in the DOM.

```vue
<template>
  <div class="content-states-container">
    <!-- Loading State -->
    <div class="loading-state" :class="{ 'state-hidden': !loading }">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>

    <!-- Empty State -->
    <div class="empty-state" :class="{ 'state-hidden': loading || items.length > 0 }">
      <span>No items found</span>
    </div>

    <!-- Content -->
    <div class="content" :class="{ 'state-hidden': loading || items.length === 0 }">
      <!-- Table or other content here -->
    </div>
  </div>
</template>

<style>
.content-states-container {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 200px; /* Prevent collapse when all states are minimal */
}

.content-states-container > * {
  grid-row: 1;
  grid-column: 1;
}

.content-states-container > .state-hidden {
  visibility: hidden;
  pointer-events: none;
  opacity: 0;
  z-index: 0;
}

.content-states-container > *:not(.state-hidden) {
  z-index: 1;
}

/* Add background to states so they cover content behind them */
.loading-state,
.empty-state {
  background: var(--bg-elevated);
}
</style>
```

**Why:** On page load, `loading` starts as `true`, then becomes `false` after data fetches. With `v-if`, the loading spinner is removed and content is added, causing a visible layout shift. CSS Grid stacking keeps all states rendered but visually hidden, so layout dimensions remain stable.

**Reference:** See `SettlementReportsView.vue` for a working implementation.

### Avoid `transition: all`
Never use `transition: all` - it can animate layout properties (width, height, margin) causing unexpected shifts.

```css
/* BAD */
.element {
  transition: all 0.15s ease;
}

/* GOOD */
.element {
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
```

### Scoped Styles - Self-Contained
Vue scoped styles must contain ALL CSS needed by the component. If you remove an `@import`, ensure all imported styles are copied into the component.

**Modals especially** need complete styling - missing modal CSS will cause modals to render inline instead of as overlays.

### Consistent Page Styling
When creating new report pages, match the existing pattern from CptReportsView.vue:

1. **CSS Variables** - Define at component root (`.settlement`, `.cpt`, etc.)
2. **Background effects** - Use fixed position with grid overlay and gradient glows
3. **Main container** - Use `max-width: 1600px; margin: 0 auto;` for centered content
4. **Metrics grid** - Use `grid-template-columns: 2fr repeat(n, 1fr)` for hero + cards layout

### Scrollbar Layout Shift
If content changes cause scrollbar to appear/disappear, add `overflow-y: scroll` to always show scrollbar (already set on `body` in main.css):

```css
body {
  overflow-y: scroll;
}
```

### Initial Page Load - Disable Transitions
On hard reload, CSS transitions can cause visible shifts as elements animate to their final positions. App.vue disables all transitions during initial render:

```vue
<script setup>
// Read localStorage synchronously (not in onMounted) to prevent shift
const savedState = localStorage.getItem('some-state')
const myState = ref(savedState === 'true')

// Disable transitions on initial load
const initialLoad = ref(true)

onMounted(() => {
  // Enable transitions after initial paint
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initialLoad.value = false
    })
  })
})
</script>

<template>
  <div :class="{ 'initial-load': initialLoad }">
    <!-- Skip Vue transitions on initial load -->
    <Transition :name="initialLoad ? '' : 'fade'">
      <component :is="Component" />
    </Transition>
  </div>
</template>

<style>
/* Disable all transitions/animations during initial load */
.initial-load,
.initial-load *,
.initial-load *::before,
.initial-load *::after {
  transition: none !important;
  animation: none !important;
}
</style>
```

**Key points:**
1. Read localStorage in setup phase (synchronous), not in `onMounted` (async)
2. Use `initialLoad` ref to disable Vue transitions on first render
3. Use double `requestAnimationFrame` to wait for browser paint before enabling transitions
4. CSS `!important` overrides all transition/animation properties during initial load

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

## CLI Permissions

Claude has standing permission to run the following commands without asking:

### Supabase (non-destructive)
- `npx supabase functions list` - List deployed functions
- `npx supabase functions deploy <name>` - Deploy/update functions
- `npx supabase secrets list` - List configured secrets
- `npx supabase secrets set <name>=<value>` - Set secrets
- Invoking edge functions via curl (GET/POST to `/functions/v1/*`)
- Querying database via Supabase REST API

### Git (non-destructive)
- `git status`, `git diff`, `git log`, `git branch`
- `git add`, `git commit` (when explicitly requested)
- `git fetch`, `git pull`

### npm/Node
- `npm install`, `npm run dev`, `npm run build`
- `npm run deploy:staging`

### General
- Reading environment variables from `../.env`
- File operations within the project directory
- curl requests to project APIs (Supabase, Stripe, Airwallex)

### Requires Confirmation
- `git push`, `git reset`, `git checkout .` (destructive git operations)
- `npx supabase functions delete` (deleting functions)
- `npx supabase db reset` (database reset)
- Any operation that modifies production data directly
