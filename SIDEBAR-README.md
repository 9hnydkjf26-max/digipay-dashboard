# Shared Sidebar Component

This document explains how to use the shared sidebar component across all dashboard pages.

**Based on:** `balance-checker-fixed2.html`

## Files Created

| File | Purpose |
|------|---------|
| `sidebar.css` | All CSS styles for the sidebar, mobile overlay, responsive breakpoints, and dark mode support |
| `sidebar.js` | JavaScript module that generates sidebar HTML and provides all sidebar functionality |

## Design Features (from balance-checker-fixed2.html)

- **Dark mode support** via `@media (prefers-color-scheme: dark)`
- **Inter font** from Google Fonts
- **Sidebar width:** 240px
- **fadeIn animation** on main content wrapper
- **Flexbox user info** with min-height for consistent layout

## Critical Functionality Preserved

The shared sidebar maintains all critical functionality that was previously embedded in each page:

### 1. User Authentication Display
- **Element IDs**: `#sidebarUserAvatar`, `#sidebarUserName`
- **Function**: `updateSidebarUser(email)` - Populates user info in sidebar footer
- **Behavior**: Shows user initials as avatar, username (email prefix) as name

### 2. Sign Out Functionality
- **Function**: `handleLogout()` 
- **Behavior**: 
  1. Calls `supabase.auth.signOut()` to end the session
  2. Redirects to `login.html`
  3. Works even if sign-out fails (still redirects)

### 3. Mobile Sidebar Toggle
- **Functions**: 
  - `toggleMobileSidebar()` - Opens/closes sidebar on mobile
  - `closeMobileSidebar()` - Closes sidebar (used by overlay click)
  - `toggleSidebar()` - Alias for compatibility
- **Elements**: 
  - `#sidebar` - The sidebar element
  - `#mobileOverlay` - Backdrop when sidebar is open
  - `.mobile-header` - Top bar with hamburger menu on mobile

### 4. Navigation Items
Configured in `NAVIGATION_ITEMS` array in `sidebar.js`:
- Refunds → `stripe-refund-interface-secure.html`
- Reports → `reports.html`
- Warmup Compliance → `warmup-compliance.html`
- Balances → `balance-checker.html`
- API Secrets → `api-secrets-manager.html`

## How to Integrate

### Step 1: Include the Files

Add these lines to the `<head>` section of your HTML page:

```html
<!-- Google Fonts (recommended for consistent styling) -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">

<!-- Sidebar Component -->
<link rel="stylesheet" href="sidebar.css">
<script src="sidebar.js"></script>
```

Also ensure your body font-family includes Inter:
```css
body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}
```

### Step 2: Remove Existing Sidebar HTML

Remove the following sections from your HTML (if they exist):

```html
<!-- REMOVE: Sidebar -->
<div class="sidebar" id="sidebar">
    ...everything inside...
</div>

<!-- REMOVE: Mobile Overlay -->
<div class="mobile-overlay" id="mobileOverlay" onclick="closeMobileSidebar()"></div>

<!-- REMOVE: Mobile Header -->
<div class="mobile-header">
    ...everything inside...
</div>
```

### Step 3: Remove Duplicate CSS

Remove or comment out any sidebar-related CSS from your page's `<style>` section:
- `.sidebar` styles
- `.sidebar-header` styles
- `.sidebar-nav` styles
- `.nav-item` styles
- `.sidebar-footer` styles
- `.user-profile` styles
- `.user-avatar` styles
- `.mobile-overlay` styles
- `.mobile-header` styles
- `.hamburger` styles

### Step 4: Remove Duplicate JavaScript Functions

Remove these function definitions from your page's `<script>` section (they're now in `sidebar.js`):

```javascript
// REMOVE these functions:
window.handleLogout = async function() { ... }
window.toggleMobileSidebar = function() { ... }
window.closeMobileSidebar = function() { ... }
window.toggleSidebar = function() { ... }
function updateSidebarUser(email) { ... }
```

### Step 5: Initialize the Sidebar

Add this code to your page's initialization (inside `DOMContentLoaded` or after Supabase is initialized):

```javascript
// Initialize sidebar component
SidebarComponent.init({
    supabase: supabase  // Pass your Supabase client
});

// Update user info (after getting session)
const { data: { session } } = await supabase.auth.getSession();
if (session) {
    updateSidebarUser(session.user.email);
}
```

## Complete Integration Example

Here's a minimal example showing a fully integrated page:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Dashboard Page</title>
    
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    
    <!-- Config and Supabase -->
    <script src="config.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    
    <!-- Sidebar Component -->
    <link rel="stylesheet" href="sidebar.css">
    <script src="sidebar.js"></script>
    
    <style>
        /* Base styles matching balance-checker-fixed2.html */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            /* Light Mode (Default) */
            --color-text: #0a2540;
            --color-text-secondary: #425466;
            --color-text-tertiary: #697386;
            --color-border: #e3e8ee;
            --color-bg: #f6f9fc;
            --color-white: #ffffff;
            --color-card: #ffffff;
            --color-primary: #635bff;
            --color-primary-hover: #5851ec;
            --color-success: #00d924;
            --color-error: #cd4246;
            --shadow-sm: 0 1px 3px rgba(50, 50, 93, 0.04);
            --radius: 8px;
            --sidebar-width: 240px;
        }
        
        /* Dark Mode */
        @media (prefers-color-scheme: dark) {
            :root {
                --color-text: #e3e8ee;
                --color-text-secondary: #9ca9b3;
                --color-text-tertiary: #697386;
                --color-border: #2d3748;
                --color-bg: #0f1419;
                --color-white: #1a202c;
                --color-card: #1e2936;
                --color-primary: #7c3aed;
                --color-primary-hover: #6d28d9;
                --color-success: #10b981;
                --color-error: #ef4444;
                --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
            }
        }
        
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--color-bg);
            color: var(--color-text);
            line-height: 1.6;
            -webkit-font-smoothing: antialiased;
            display: flex;
            min-height: 100vh;
        }
        
        .hidden { display: none !important; }
        
        #authenticatedContent {
            display: flex;
            width: 100%;
            min-height: 100vh;
        }
        
        #authenticatedContent.hidden { display: none; }
        
        /* Your page-specific styles here */
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 24px;
        }
    </style>
</head>
<body>
    <!-- Authenticated Content Container -->
    <div id="authenticatedContent" class="hidden">
        <!-- Sidebar will be inserted here automatically -->
        
        <!-- Main Content Wrapper -->
        <div class="main-wrapper">
            <div class="container">
                <h1>My Page</h1>
                <!-- Your content here -->
            </div>
        </div>
    </div>

    <script>
        // Initialize Supabase
        const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
        const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || '';
        const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        document.addEventListener('DOMContentLoaded', async () => {
            // Check authentication
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session) {
                window.location.href = 'login.html';
                return;
            }
            
            // Initialize sidebar with Supabase client
            SidebarComponent.init({
                supabase: supabase
            });
            
            // Update user info in sidebar
            updateSidebarUser(session.user.email);
            
            // Show authenticated content
            document.getElementById('authenticatedContent').classList.remove('hidden');
            
            // Optional: Enable smooth page transitions
            SidebarComponent.enableSmoothTransitions();
        });
    </script>
</body>
</html>
```

## Customizing the Sidebar

### Adding New Navigation Items

Edit `NAVIGATION_ITEMS` in `sidebar.js`:

```javascript
const NAVIGATION_ITEMS = [
    // ... existing items ...
    {
        href: 'new-page.html',
        icon: '🆕',
        label: 'New Page',
        ariaLabel: 'Navigate to New Page'
    }
];
```

### Changing Logo/Branding

Edit `SIDEBAR_CONFIG` in `sidebar.js`:

```javascript
const SIDEBAR_CONFIG = {
    logoText: 'My Dashboard',      // Text logo
    logoSubtitle: 'Admin Portal',  // Subtitle text
    logoImage: 'logo.png',         // Set to use image instead of text
    defaultRole: 'Admin'           // User role display
};
```

### Custom Active Page Detection

If automatic detection doesn't work for your page:

```javascript
SidebarComponent.init({
    supabase: supabase,
    activePage: 'my-custom-page.html'  // Force specific active state
});
```

## Migration Checklist

When converting an existing page to use the shared sidebar:

- [ ] Add `sidebar.css` link in `<head>`
- [ ] Add `sidebar.js` script in `<head>`
- [ ] Remove inline sidebar HTML
- [ ] Remove inline sidebar CSS (or ensure no conflicts)
- [ ] Remove duplicate JavaScript functions
- [ ] Add `SidebarComponent.init()` call
- [ ] Call `updateSidebarUser()` after authentication
- [ ] Test on desktop and mobile
- [ ] Verify logout works
- [ ] Verify navigation links work
- [ ] Verify active state shows correctly

## Troubleshooting

### Sidebar doesn't appear
- Check that `sidebar.js` is loaded before initialization
- Ensure you have a `.main-wrapper` or `#authenticatedContent` element
- Check browser console for errors

### Logout doesn't work
- Ensure Supabase client is passed to `SidebarComponent.init()`
- Check that `window.supabase` or `window.mySupabase` is available

### Mobile menu doesn't work
- Verify `sidebar.css` is loaded
- Check that click handlers are properly attached
- Ensure no CSS conflicts with `.mobile-open` class

### Wrong page shows as active
- Use the `activePage` option in `SidebarComponent.init()`
- Check that `href` values match your actual filenames
