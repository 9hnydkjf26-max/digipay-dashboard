/**
 * ========================================
 * SHARED SIDEBAR COMPONENT - PREMIUM EDITION
 * ========================================
 * 
 * Dark, sophisticated sidebar with warm amber accents.
 * Works with router.js to provide SPA-like navigation.
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
var NAVIGATION_ITEMS = [
    {
        href: 'reports.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
        label: 'Reports',
        ariaLabel: 'Navigate to Reports page',
        section: 'overview'
    },
    {
        href: 'balances.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>',
        label: 'Balances',
        ariaLabel: 'Navigate to Balances page',
        section: 'overview'
    },
    {
        href: 'cpt-reports.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
        label: 'CPT Reports',
        ariaLabel: 'Navigate to CPT Reports page',
        section: 'overview'
    },
    {
        href: 'settlement-report.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12l-3-3m0 0l-3 3m3-3v12"/></svg>',
        label: 'Settlement Report',
        ariaLabel: 'Navigate to Settlement Report page',
        section: 'overview'
    },
    {
        href: 'refunds.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
        label: 'Refunds',
        ariaLabel: 'Navigate to Refunds page',
        section: 'operations'
    },
    {
        href: 'warmup.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
        label: 'Warmup',
        ariaLabel: 'Navigate to Warmup page',
        section: 'operations'
    },
    {
        href: 'pricing.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
        label: 'Pricing',
        ariaLabel: 'Navigate to Pricing page',
        section: 'settings'
    }
];

// Section labels for grouping navigation items
var SECTION_LABELS = {
    'overview': 'Overview',
    'operations': 'Operations',
    'settings': 'Settings'
};

// Sidebar configuration
var SIDEBAR_CONFIG = {
    logoText: 'Dashboard',
    logoSubtitle: 'Payment Management',
    logoImage: null, // Set to image path to use logo image instead
    defaultRole: 'Admin',
    showSections: true // Set to false to disable section headers
};

/**
 * Initialize the sidebar component
 */
function initSidebar(options) {
    options = options || {};
    var activePage = options.activePage || null;
    
    console.log('Sidebar: Initializing...');
    
    // Get current user role
    getUserRole().then(function(userRole) {
        console.log('Sidebar: User role:', userRole);
        
        // Generate and inject sidebar HTML
        var sidebarHTML = generateSidebarHTML(activePage, userRole);
        
        // Find wrapper or content container
        var mainWrapper = document.querySelector('.main-wrapper') || 
                          document.getElementById('authenticatedContent') ||
                          document.body;
        
        // Create sidebar container if it doesn't exist
        var existingSidebar = document.getElementById('sidebar');
        if (!existingSidebar) {
            var sidebarDiv = document.createElement('div');
            sidebarDiv.id = 'sidebar-container';
            sidebarDiv.innerHTML = sidebarHTML;
            
            // Insert at the beginning of the wrapper
            mainWrapper.insertBefore(sidebarDiv, mainWrapper.firstChild);
            console.log('Sidebar: Created and inserted sidebar container');
        } else {
            // Update existing sidebar
            existingSidebar.outerHTML = sidebarHTML;
            console.log('Sidebar: Updated existing sidebar');
        }
        
        // Setup event listeners
        setupEventListeners();
        
        // Update user info
        updateSidebarUser();
        
        console.log('Sidebar: Initialization complete');
    }).catch(function(error) {
        console.error('Sidebar: Initialization error:', error);
    });
}

/**
 * Get current user's role from Supabase
 */
async function getUserRole() {
    try {
        var supabase = getSupabaseClient();
        if (!supabase) {
            console.warn('Sidebar: Supabase client not available');
            return null;
        }
        
        var session = await supabase.auth.getSession();
        if (!session || !session.data || !session.data.session) {
            console.warn('Sidebar: No active session');
            return null;
        }
        
        var userId = session.data.session.user.id;
        
        // Query user_roles table
        var result = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', userId)
            .single();
        
        if (result.error) {
            console.warn('Sidebar: Error fetching user role:', result.error);
            return null;
        }
        
        return result.data ? result.data.role : null;
    } catch (error) {
        console.warn('Sidebar: Error in getUserRole:', error);
        return null;
    }
}

/**
 * Get Supabase client from window
 */
function getSupabaseClient() {
    return window.supabaseClient || window.mySupabase || window.supabase;
}

/**
 * Setup event listeners for sidebar interactions
 */
function setupEventListeners() {
    // Mobile menu toggle
    var hamburger = document.getElementById('hamburgerBtn');
    if (hamburger) {
        hamburger.addEventListener('click', toggleMobileSidebar);
    }
    
    // Mobile overlay click
    var overlay = document.getElementById('mobileOverlay');
    if (overlay) {
        overlay.addEventListener('click', closeMobileSidebar);
    }
    
    // Logout button
    var logoutBtn = document.getElementById('sidebarLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

/**
 * Update sidebar with current user information
 */
async function updateSidebarUser() {
    try {
        var supabase = getSupabaseClient();
        if (!supabase) return;
        
        var session = await supabase.auth.getSession();
        if (!session || !session.data || !session.data.session) return;
        
        var user = session.data.session.user;
        
        // Update user name
        var nameEl = document.getElementById('sidebarUserName');
        if (nameEl) {
            nameEl.textContent = user.email.split('@')[0];
        }
        
        // Update user avatar
        var avatarEl = document.getElementById('sidebarUserAvatar');
        if (avatarEl) {
            var initial = user.email.charAt(0).toUpperCase();
            avatarEl.textContent = initial;
        }
    } catch (error) {
        console.warn('Sidebar: Error updating user info:', error);
    }
}

/**
 * Handle user logout
 */
async function handleLogout() {
    try {
        var supabase = getSupabaseClient();
        if (supabase) {
            await supabase.auth.signOut();
        }
    } catch (error) {
        console.error('Sidebar: Logout error:', error);
    } finally {
        window.location.href = 'login.html';
    }
}

/**
 * Toggle mobile sidebar open/closed
 */
function toggleMobileSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('mobileOverlay');
    
    if (sidebar && overlay) {
        var isOpen = sidebar.classList.contains('mobile-open');
        
        if (isOpen) {
            closeMobileSidebar();
        } else {
            sidebar.classList.add('mobile-open');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }
}

/**
 * Close mobile sidebar
 */
function closeMobileSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('mobileOverlay');
    
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
}

/**
 * Alias for toggleMobileSidebar (for compatibility)
 */
function toggleSidebar() {
    toggleMobileSidebar();
}

/**
 * Group navigation items by section
 */
function groupBySection(items) {
    var sections = {};
    items.forEach(function(item) {
        var section = item.section || 'default';
        if (!sections[section]) {
            sections[section] = [];
        }
        sections[section].push(item);
    });
    return sections;
}

/**
 * Generate the sidebar HTML
 */
function generateSidebarHTML(activePage, userRole) {
    var currentPage = activePage || window.location.pathname.split('/').pop() || 'index.html';
    var isAdmin = (userRole === 'admin');
    
    console.log('Sidebar: generateSidebarHTML called with role:', userRole, 'isAdmin:', isAdmin);
    
    // Filter nav items based on role
    var visibleItems = NAVIGATION_ITEMS.filter(function(item) {
        if (item.requiresAdmin) {
            return isAdmin === true;
        }
        return true;
    });
    
    // Build navigation HTML
    var navItemsHTML = '';
    
    if (SIDEBAR_CONFIG.showSections) {
        var sections = groupBySection(visibleItems);
        var sectionOrder = ['overview', 'operations', 'settings', 'default'];
        
        sectionOrder.forEach(function(sectionKey) {
            if (sections[sectionKey] && sections[sectionKey].length > 0) {
                var label = SECTION_LABELS[sectionKey] || '';
                if (label) {
                    navItemsHTML += '<div class="nav-section">';
                    navItemsHTML += '<div class="nav-section-label">' + label + '</div>';
                }
                
                sections[sectionKey].forEach(function(item) {
                    var isActive = currentPage === item.href || 
                                    currentPage.indexOf(item.href.replace('.html', '')) !== -1;
                    navItemsHTML += '<a href="' + item.href + '" ' +
                           'class="nav-item' + (isActive ? ' active' : '') + '" ' +
                           'aria-label="' + item.ariaLabel + '"' +
                           (isActive ? ' aria-current="page"' : '') + '>' +
                           '<span class="nav-item-icon">' + item.icon + '</span>' +
                           '<span class="nav-item-label">' + item.label + '</span>' +
                           '</a>';
                });
                
                if (label) {
                    navItemsHTML += '</div>';
                }
            }
        });
    } else {
        visibleItems.forEach(function(item) {
            var isActive = currentPage === item.href || 
                            currentPage.indexOf(item.href.replace('.html', '')) !== -1;
            navItemsHTML += '<a href="' + item.href + '" ' +
                   'class="nav-item' + (isActive ? ' active' : '') + '" ' +
                   'aria-label="' + item.ariaLabel + '"' +
                   (isActive ? ' aria-current="page"' : '') + '>' +
                   '<span class="nav-item-icon">' + item.icon + '</span>' +
                   '<span class="nav-item-label">' + item.label + '</span>' +
                   '</a>';
        });
    }
    
    // Generate logo HTML
    var logoHTML = '';
    if (SIDEBAR_CONFIG.logoImage) {
        logoHTML = '<img src="' + SIDEBAR_CONFIG.logoImage + '" alt="' + SIDEBAR_CONFIG.logoText + '" class="sidebar-logo-img">';
    } else {
        logoHTML = '<div class="sidebar-logo-text">' +
                   '<div class="logo-main">' + SIDEBAR_CONFIG.logoText + '</div>' +
                   (SIDEBAR_CONFIG.logoSubtitle ? '<div class="logo-subtitle">' + SIDEBAR_CONFIG.logoSubtitle + '</div>' : '') +
                   '</div>';
    }
    
    // Complete sidebar HTML
    return `
    <!-- Mobile Header -->
    <div class="mobile-header">
        <button class="hamburger" id="hamburgerBtn" aria-label="Toggle sidebar">
            <span></span>
            <span></span>
            <span></span>
        </button>
        <div class="mobile-title">${SIDEBAR_CONFIG.logoText}</div>
    </div>
    
    <!-- Mobile Overlay -->
    <div class="mobile-overlay" id="mobileOverlay"></div>
    
    <!-- Sidebar -->
    <div class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-logo">
                ${logoHTML}
            </div>
        </div>
        
        <nav class="sidebar-nav">
            ${navItemsHTML}
        </nav>
        
        <div class="sidebar-footer">
            <div class="user-profile">
                <div class="user-avatar" id="sidebarUserAvatar">U</div>
                <div class="user-info-sidebar">
                    <div class="user-name" id="sidebarUserName">User</div>
                    <div class="user-role">${SIDEBAR_CONFIG.defaultRole}</div>
                </div>
            </div>
            <button class="btn btn-secondary" id="sidebarLogoutBtn" style="width: 100%; margin-top: 12px;">
                Sign out
            </button>
        </div>
    </div>
    `;
}

// Make functions globally available
window.initSidebar = initSidebar;
window.updateSidebarUser = updateSidebarUser;
window.handleLogout = handleLogout;
window.toggleMobileSidebar = toggleMobileSidebar;
window.toggleSidebar = toggleSidebar;
window.closeMobileSidebar = closeMobileSidebar;
