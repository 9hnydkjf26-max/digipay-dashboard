/**
 * ========================================
 * SHARED SIDEBAR COMPONENT
 * ========================================
 * 
 * This module provides a reusable sidebar component for all dashboard pages.
 * Works with router.js to provide SPA-like navigation without page reloads.
 * 
 * USAGE:
 * 1. Include sidebar.css in <head>
 * 2. Include this script in <head> or before </body>
 * 3. Include router.js after this script
 * 4. Call initSidebar() after DOM is loaded
 * 5. Call Router.init() after initSidebar()
 * 
 * ========================================
 */

// Navigation items configuration
// Add/remove items here to update all pages at once
const NAVIGATION_ITEMS = [
    {
        href: 'refunds.html',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h10a5 5 0 0 1 5 5v6H8a5 5 0 0 1-5-5v-6z"/><path d="M7 10V6a5 5 0 0 1 10 0v4"/></svg>',
        label: 'Refunds',
        ariaLabel: 'Navigate to Refunds page'
    },
    {
        href: 'reports.html',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>',
        label: 'Reports',
        ariaLabel: 'Navigate to Reports page'
    },
    {
        href: 'warmup.html',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>',
        label: 'Warm Up',
        ariaLabel: 'Navigate to Warm Up page'
    },
    {
        href: 'balances.html',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 10v4"/><path d="M2 10h20"/></svg>',
        label: 'Balances',
        ariaLabel: 'Navigate to Balances page'
    },
    {
        href: 'admin.html',
        icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        label: 'Admin',
        ariaLabel: 'Navigate to Admin page'
    }
];

// Sidebar configuration
const SIDEBAR_CONFIG = {
    logoText: 'Dashboard',
    logoSubtitle: null,
    logoImage: 'digipaylogo.svg',
    logoHeight: '40px',
    logoHeightMobile: '32px',
    defaultRole: 'Admin'
};

// Store Supabase client reference
let _supabaseClient = null;

/**
 * Generate the sidebar HTML
 * @param {string} activePage - The filename of the current page
 * @returns {string} - The sidebar HTML string
 */
function generateSidebarHTML(activePage) {
    const currentPage = activePage || window.location.pathname.split('/').pop() || 'index.html';
    
    const navItemsHTML = NAVIGATION_ITEMS.map(item => {
        const isActive = currentPage === item.href || 
                        currentPage.includes(item.href.replace('.html', ''));
        return `
            <a href="${item.href}" 
               class="nav-item${isActive ? ' active' : ''}" 
               aria-label="${item.ariaLabel}"
               ${isActive ? 'aria-current="page"' : ''}>
                <span class="nav-item-icon">${item.icon}</span>
                ${item.label}
            </a>
        `;
    }).join('');
    
    const logoHTML = SIDEBAR_CONFIG.logoImage 
        ? `<img src="${SIDEBAR_CONFIG.logoImage}" alt="Logo" style="height: ${SIDEBAR_CONFIG.logoHeight || '32px'}; width: auto; display: block; margin: 0 auto;">`
        : SIDEBAR_CONFIG.logoText;
    
    return `
        <!-- Sidebar -->
        <div class="sidebar" id="sidebar">
            <div class="sidebar-header" style="text-align: center;">
                <div class="sidebar-logo">${logoHTML}</div>
                ${SIDEBAR_CONFIG.logoSubtitle ? `<div class="sidebar-subtitle">${SIDEBAR_CONFIG.logoSubtitle}</div>` : ''}
            </div>
            
            <nav class="sidebar-nav">
                ${navItemsHTML}
            </nav>
            
            <div class="sidebar-footer">
                <div class="user-profile">
                    <div class="user-avatar" id="sidebarUserAvatar"></div>
                    <div class="user-info-sidebar">
                        <div class="user-name" id="sidebarUserName"></div>
                        <div class="user-role">${SIDEBAR_CONFIG.defaultRole}</div>
                    </div>
                </div>
                <button class="btn btn-secondary" style="width: 100%;" onclick="handleLogout()">
                    Sign out
                </button>
            </div>
        </div>

        <!-- Mobile Overlay -->
        <div class="mobile-overlay" id="mobileOverlay" onclick="closeMobileSidebar()"></div>

        <!-- Mobile Header -->
        <div class="mobile-header">
            <button class="hamburger" onclick="toggleMobileSidebar()" aria-label="Toggle menu">
                <span></span>
                <span></span>
                <span></span>
            </button>
            <div class="sidebar-logo">${SIDEBAR_CONFIG.logoImage ? `<img src="${SIDEBAR_CONFIG.logoImage}" alt="Logo" style="height: ${SIDEBAR_CONFIG.logoHeightMobile || '28px'}; width: auto;">` : SIDEBAR_CONFIG.logoText}</div>
            <div style="width: 40px;"></div>
        </div>
    `;
}

/**
 * Initialize the sidebar component
 * @param {Object} options - Configuration options
 */
function initSidebar(options = {}) {
    const container = options.container || document.querySelector('.main-wrapper') || document.querySelector('#authenticatedContent');
    
    if (!container) {
        console.error('Sidebar: No container found.');
        return;
    }
    
    // Store Supabase reference
    _supabaseClient = options.supabase || window.supabase || window.mySupabase;
    
    // Check if sidebar already exists (don't duplicate)
    if (document.getElementById('sidebar')) {
        console.log('Sidebar: Already initialized');
        setActivePage(options.activePage);
        return;
    }
    
    // Generate and insert sidebar HTML
    const sidebarHTML = generateSidebarHTML(options.activePage);
    container.insertAdjacentHTML('beforebegin', sidebarHTML);
    
    // Initialize user display
    initUserDisplay();
    
    console.log('Sidebar: Initialized successfully');
}

/**
 * Initialize user display in sidebar
 */
async function initUserDisplay() {
    const supabase = _supabaseClient || window.supabase || window.mySupabase;
    
    if (!supabase) {
        console.warn('Sidebar: Supabase client not available for user display');
        return;
    }
    
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) {
            updateSidebarUser(user.email);
        }
    } catch (error) {
        console.error('Sidebar: Error getting user:', error);
    }
}

/**
 * Update sidebar with user information
 * @param {string} email - User's email address
 */
function updateSidebarUser(email) {
    const avatarEl = document.getElementById('sidebarUserAvatar');
    const nameEl = document.getElementById('sidebarUserName');
    
    if (avatarEl && email) {
        const initials = email.substring(0, 2).toUpperCase();
        avatarEl.textContent = initials;
    }
    
    if (nameEl && email) {
        const username = email.split('@')[0];
        nameEl.textContent = username;
    }
}

// Make updateSidebarUser available globally
window.updateSidebarUser = updateSidebarUser;

/**
 * Handle logout
 */
async function handleLogout() {
    const supabase = _supabaseClient || window.supabase || window.mySupabase;
    
    try {
        if (supabase) {
            await supabase.auth.signOut();
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    // Always redirect to login
    window.location.href = 'login.html';
}

// Make handleLogout available globally
window.handleLogout = handleLogout;

/**
 * Toggle mobile sidebar
 */
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
    }
    if (overlay) {
        overlay.classList.toggle('active');
    }
}

/**
 * Close mobile sidebar
 */
function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    
    if (sidebar) {
        sidebar.classList.remove('mobile-open');
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Alias for compatibility
function toggleSidebar() {
    toggleMobileSidebar();
}

// Make mobile functions available globally
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.toggleSidebar = toggleSidebar;

/**
 * Set the active page in navigation
 * @param {string} page - Optional page name override
 */
function setActivePage(page) {
    const currentPage = page || window.location.pathname.split('/').pop() || 'index.html';
    
    document.querySelectorAll('.nav-item').forEach(item => {
        const href = item.getAttribute('href');
        const isActive = href === currentPage || currentPage.includes(href.replace('.html', ''));
        
        if (isActive) {
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
        } else {
            item.classList.remove('active');
            item.removeAttribute('aria-current');
        }
    });
    
    // Close mobile sidebar on navigation
    closeMobileSidebar();
}

// Make setActivePage available globally (router needs this)
window.setActivePage = setActivePage;

/**
 * DEPRECATED: Use Router.init() instead
 * Kept for backwards compatibility
 */
function enableSmoothTransitions() {
    console.warn('Sidebar: enableSmoothTransitions() is deprecated. Use Router.init() instead.');
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initSidebar,
        updateSidebarUser,
        setActivePage,
        NAVIGATION_ITEMS,
        SIDEBAR_CONFIG
    };
}

// Global API
window.SidebarComponent = {
    init: initSidebar,
    updateUser: updateSidebarUser,
    setActivePage,
    NAVIGATION_ITEMS,
    SIDEBAR_CONFIG
};
