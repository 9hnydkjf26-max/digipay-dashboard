/**
 * ========================================
 * SHARED SIDEBAR COMPONENT
 * ========================================
 * 
 * This module provides a reusable sidebar component for all dashboard pages.
 * Based on: balance-checker-fixed2.html
 * 
 * It handles:
 * - Rendering the sidebar HTML
 * - User profile display
 * - Navigation with active state detection
 * - Mobile sidebar toggle functionality
 * - Logout functionality
 * 
 * USAGE:
 * 1. Include this script in your HTML page
 * 2. Call initSidebar() after DOM is loaded
 * 3. Make sure you have a Supabase client available
 * 
 * CRITICAL DEPENDENCIES:
 * - Supabase client must be initialized before calling initSidebar()
 * - CSS from sidebar.css must be included
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
    logoSubtitle: null, // Set to null to hide subtitle
    logoImage: 'digipaylogo.svg', // Logo image file - set to null to use text instead
    logoHeight: '40px',    // Logo height for desktop sidebar
    logoHeightMobile: '32px', // Logo height for mobile header
    defaultRole: 'Admin'
};

/**
 * Generate the sidebar HTML
 * @param {string} activePage - The filename of the current page (e.g., 'reports.html')
 * @returns {string} - The sidebar HTML string
 */
function generateSidebarHTML(activePage) {
    const currentPage = activePage || window.location.pathname.split('/').pop() || 'index.html';
    
    // Generate navigation items
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
    
    // Generate logo HTML
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
 * @param {HTMLElement} options.container - The container element to insert the sidebar before
 * @param {Object} options.supabase - The Supabase client instance
 * @param {string} options.activePage - Override the active page detection
 */
function initSidebar(options = {}) {
    const container = options.container || document.querySelector('.main-wrapper') || document.querySelector('#authenticatedContent');
    
    if (!container) {
        console.error('Sidebar: No container found. Make sure you have a .main-wrapper or #authenticatedContent element.');
        return;
    }
    
    // Generate and insert sidebar HTML
    const sidebarHTML = generateSidebarHTML(options.activePage);
    container.insertAdjacentHTML('beforebegin', sidebarHTML);
    
    // Register global functions
    registerSidebarFunctions(options.supabase);
    
    console.log('✓ Sidebar initialized successfully');
}

/**
 * Register global sidebar functions
 * @param {Object} supabaseClient - The Supabase client instance
 */
function registerSidebarFunctions(supabaseClient) {
    // Store supabase reference for logout
    window._sidebarSupabase = supabaseClient;
    
    /**
     * Handle user logout
     * Signs out from Supabase and redirects to login page
     */
    window.handleLogout = async function() {
        console.log('🚪 Logout clicked');
        try {
            const client = window._sidebarSupabase || window.supabase || window.mySupabase;
            if (client) {
                await client.auth.signOut();
                console.log('✓ Signed out successfully');
            }
            window.location.href = 'login.html';
        } catch (err) {
            console.error('✗ Logout error:', err);
            // Still redirect to login even if signOut fails
            window.location.href = 'login.html';
        }
    };
    
    /**
     * Toggle mobile sidebar visibility
     */
    window.toggleMobileSidebar = function() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        if (sidebar) sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('active');
    };
    
    /**
     * Close mobile sidebar
     */
    window.closeMobileSidebar = function() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
    };
    
    /**
     * Toggle sidebar (alternative function name used by some pages)
     */
    window.toggleSidebar = function() {
        window.toggleMobileSidebar();
    };
    
    /**
     * Update sidebar user information
     * @param {string} email - The user's email address
     */
    window.updateSidebarUser = function(email) {
        const avatar = document.getElementById('sidebarUserAvatar');
        const name = document.getElementById('sidebarUserName');
        
        if (avatar && email) {
            // Show first letter(s) as avatar
            avatar.textContent = email.substring(0, 2).toUpperCase();
        }
        if (name && email) {
            // Show username part of email
            name.textContent = email.split('@')[0];
        }
    };
    
    console.log('✓ Sidebar functions registered');
}

/**
 * Update navigation to reflect the current active page
 * @param {string} activePage - The filename of the active page
 */
function setActivePage(activePage) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const href = item.getAttribute('href');
        if (href === activePage || activePage.includes(href.replace('.html', ''))) {
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
        } else {
            item.classList.remove('active');
            item.removeAttribute('aria-current');
        }
    });
}

/**
 * Add smooth page transitions when navigating
 */
function enableSmoothTransitions() {
    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            const currentPage = window.location.pathname.split('/').pop();
            
            // Don't animate if clicking current page or anchor links
            if (href && href !== currentPage && !href.startsWith('#')) {
                e.preventDefault();
                const mainWrapper = document.querySelector('.main-wrapper');
                if (mainWrapper) {
                    mainWrapper.style.transition = 'opacity 0.2s ease-out';
                    mainWrapper.style.opacity = '0';
                }
                setTimeout(() => {
                    window.location.href = href;
                }, 200);
            }
        });
    });
}

// Export functions for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initSidebar,
        updateSidebarUser: window.updateSidebarUser,
        setActivePage,
        enableSmoothTransitions,
        NAVIGATION_ITEMS,
        SIDEBAR_CONFIG
    };
}

// Make available globally
window.SidebarComponent = {
    init: initSidebar,
    setActivePage,
    enableSmoothTransitions,
    NAVIGATION_ITEMS,
    SIDEBAR_CONFIG
};
