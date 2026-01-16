# Digipay Plugin Changelog

## [12.6.9] - UI Consistency

### Changed
- **Gateway Settings** now displayed in a styled container matching Transaction Limits and Stats sections
- Consistent card-style layout across all sections in Credit Card tab

---

## [12.6.8] - UI Improvements

### Changed
- Removed "Allows Payments" description text
- **Transaction Limits** and **Today's Credit Card Stats** now appear ABOVE the Gateway Settings
- Added "Gateway Settings" header for clarity

---

## [12.6.7] - Gateway Ordering Fix v2

### Fixed
- **Better gateway ordering logic** - Now properly handles WooCommerce's associative array format for `woocommerce_gateway_order`
- Sets Digipay to position -1 then re-indexes all gateways starting from 0
- Runs on both `admin_init` and specifically on the WooCommerce settings page

---

## [12.6.6] - Gateway Ordering Fix

### Fixed
- **Digipay now properly appears FIRST** in WooCommerce Payment Gateways list
- Modifies WooCommerce's stored `woocommerce_gateway_order` option to ensure top position
- Sets order on both plugin activation and admin page load

---

## [12.6.5] - Gateway Ordering

### Added
- **Digipay now appears FIRST** in the WooCommerce Payment Gateways list
- Uses priority 999 filter to ensure it always appears at the top regardless of other plugins

---

## [12.6.4] - UI Fix

### Fixed
- **Transaction Limits and Stats** now properly display INSIDE the Credit Card tab
- Removed duplicate stats display that was appearing outside the tabs
- Labels updated to "Credit Card Transaction Limits" and "Today's Credit Card Stats" for clarity

---

## [12.6.3] - UI Enhancement

### Added
- **Tabbed Interface** in plugin settings with three tabs:
  - 💳 Credit Card - Contains all current settings (gateway settings, transaction limits, stats, diagnostics)
  - ₿ Crypto - Coming soon placeholder
  - 🏦 E-Transfer - Coming soon placeholder

---

## [12.6.2] - Compatibility Fix

### Fixed
- **Critical:** Restored original encryption key for payment processor compatibility
  - The encryption key must match between plugin and secure.digipay.co
  - Key can still be customized via `DIGIPAY_ENCRYPTION_KEY` in wp-config.php if also updated on payment processor

### Note on Encryption Key
The encryption key is a shared secret between this plugin and the payment processor server. Changing it on one side requires updating it on both sides. The key is now configurable but defaults to the synchronized value.

---

## [12.6.1] - Bugfix Release

### Fixed
- **Critical:** Fixed "Call to undefined function wp_generate_password()" error on plugin load
  - Now uses PHP's `random_bytes()` as fallback when WordPress functions aren't available yet

---

## [12.6.0] - Security Release

### Security Fixes

#### 🔴 CRITICAL
1. **Encryption Key** - Replaced hardcoded encryption key with dynamically generated per-site key stored in database
2. **CSRF Protection** - Added nonce verification to all admin diagnostic actions
3. **Order Status Endpoint** - Secured `inc/debitway_postback_ifsuccess.php` with authentication and capability checks
4. **Referrer Validation** - Fixed faulty logic in postback referrer validation (was using `||` instead of proper logic)

#### 🟠 HIGH  
5. **Debug Logging** - Disabled debug logging by default; only logs when `WP_DEBUG` is enabled
6. **Capability Checks** - Added `manage_woocommerce` capability check to all admin actions
7. **Directory Permissions** - Fixed insecure 0777 directory permissions

#### 🟡 MEDIUM
8. **Input Sanitization** - Replaced error suppression (`@`) with proper `isset()` checks
9. **Variable Fix** - Fixed undefined variable `$blockeddata` vs `$blocked_data`
10. **Output Escaping** - Properly escaped all output in admin shipping form

#### 🟢 LOW
11. **Security Headers** - Added X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
12. **Rate Limiting** - Added rate limiting to postback endpoint (60 requests/minute per IP)
13. **Directory Index** - Added index.php files to prevent directory listing

### Changes
- Version bumped to 12.6.0
- Log files now stored in protected `wp-content/uploads/digipay-logs/` directory with .htaccess
- Sensitive fields (card numbers, CVV, etc.) redacted from debug logs
- All admin action buttons now include CSRF tokens
- Postback deduplication to prevent double-processing

### Upgrade Notes
- **Encryption Key Migration**: On first load after update, a new unique encryption key will be generated for your site
- **No Breaking Changes**: All existing functionality preserved
- Sites can optionally define `DIGIPAY_ENCRYPTION_KEY` in wp-config.php to use a custom key

---

## [12.5.8] - Previous Release
- Postback tracking improvements
- Plugin admin dashboard health reporting
- Auto-update system via GitHub releases
