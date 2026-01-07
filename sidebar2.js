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
        href: 'refunds.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
        label: 'Refunds',
        ariaLabel: 'Navigate to Refunds page',
        section: 'operations'
    },
    {
        href: 'warmup.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
        label: 'Warm Up',
        ariaLabel: 'Navigate to Warm Up page',
        section: 'operations'
    },
    {
        href: 'admin.html',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
        label: 'Admin',
        ariaLabel: 'Navigate to Admin page',
        section: 'settings',
        requiresAdmin: true
    }
];

// Section labels
var SECTION_LABELS = {
    overview: 'Overview',
    operations: 'Operations',
    settings: 'Settings'
};

// Sidebar configuration
var SIDEBAR_CONFIG = {
    logoText: 'DigiPay',
    logoSubtitle: 'Payments',
    logoImage: 'digipaylogo.svg',
    logoHeight: '42px',
    logoHeightMobile: '32px',
    defaultRole: 'Admin',
    showSections: true // Set to false to disable section grouping
};

// Store Supabase client reference and user role
var _supabaseClient = null;
var _userRole = null;

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
    
    // Logo HTML - if image provided, show it centered; otherwise show styled text
    var logoHTML;
    if (SIDEBAR_CONFIG.logoImage) {
        logoHTML = '<img src="' + SIDEBAR_CONFIG.logoImage + '" alt="' + SIDEBAR_CONFIG.logoText + '" class="logo-image">';
    } else {
        logoHTML = '<div class="logo-mark">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' +
              '</svg></div>' +
              '<div class="logo-text">' +
              '<div class="logo-title">' + SIDEBAR_CONFIG.logoText + '</div>' +
              (SIDEBAR_CONFIG.logoSubtitle ? '<div class="sidebar-subtitle">' + SIDEBAR_CONFIG.logoSubtitle + '</div>' : '') +
              '</div>';
    }
    
    var mobileLogoHTML;
    if (SIDEBAR_CONFIG.logoImage) {
        mobileLogoHTML = '<img src="' + SIDEBAR_CONFIG.logoImage + '" alt="' + SIDEBAR_CONFIG.logoText + '" style="height: ' + (SIDEBAR_CONFIG.logoHeightMobile || '32px') + '; width: auto;">';
    } else {
        mobileLogoHTML = '<span style="font-family: Instrument Serif, Georgia, serif; font-style: italic; font-size: 20px; color: #fff;">' + SIDEBAR_CONFIG.logoText + '</span>';
    }
    
    // Sign out icon
    var signOutIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>';
    
    return '<!-- Sidebar -->' +
        '<div class="sidebar" id="sidebar">' +
            '<div class="sidebar-header">' +
                '<div class="sidebar-logo">' + logoHTML + '</div>' +
            '</div>' +
            '<nav class="sidebar-nav" id="sidebarNav">' +
                navItemsHTML +
            '</nav>' +
            '<div class="sidebar-footer">' +
                '<div class="user-profile">' +
                    '<div class="user-avatar" id="sidebarUserAvatar"></div>' +
                    '<div class="user-info-sidebar">' +
                        '<div class="user-name" id="sidebarUserName"></div>' +
                        '<div class="user-role" id="sidebarUserRole">' + SIDEBAR_CONFIG.defaultRole + '</div>' +
                    '</div>' +
                '</div>' +
                '<button class="btn-signout" onclick="handleLogout()">' +
                    signOutIcon +
                    '<span>Sign out</span>' +
                '</button>' +
            '</div>' +
        '</div>' +
        '<!-- Mobile Overlay -->' +
        '<div class="mobile-overlay" id="mobileOverlay" onclick="closeMobileSidebar()"></div>' +
        '<!-- Mobile Header -->' +
        '<div class="mobile-header">' +
            '<button class="hamburger" id="hamburgerBtn" onclick="toggleMobileSidebar()" aria-label="Toggle menu">' +
                '<span></span>' +
                '<span></span>' +
                '<span></span>' +
            '</button>' +
            '<div class="sidebar-logo">' + mobileLogoHTML + '</div>' +
            '<div style="width: 44px;"></div>' +
        '</div>';
}

/**
 * Initialize the sidebar component
 */
function initSidebar(options) {
    options = options || {};
    var container = options.container || document.querySelector('.main-wrapper') || document.querySelector('#authenticatedContent');
    
    if (!container) {
        console.error('Sidebar: No container found.');
        return;
    }
    
    _supabaseClient = options.supabase || window.supabaseClient || window.supabase || window.mySupabase;
    
    if (document.getElementById('sidebar')) {
        console.log('Sidebar: Already initialized');
        setActivePage(options.activePage);
        checkAndUpdateRole();
        return;
    }
    
    var sidebarHTML = generateSidebarHTML(options.activePage, _userRole);
    container.insertAdjacentHTML('beforebegin', sidebarHTML);
    
    initUserDisplay();
    
    console.log('Sidebar: Initialized successfully');
}

/**
 * Check user role and update nav if needed
 */
async function checkAndUpdateRole() {
    var supabase = _supabaseClient || window.supabaseClient || window.supabase || window.mySupabase;
    
    if (!supabase) return;
    
    try {
        var result = await supabase.auth.getSession();
        var session = result.data.session;
        
        if (session && session.user) {
            var userRole = (session.user.user_metadata && session.user.user_metadata.role) || 
                          (session.user.app_metadata && session.user.app_metadata.role);
            
            if (userRole && userRole !== _userRole) {
                _userRole = userRole;
                updateNavForRole(userRole);
            }
        }
    } catch (error) {
        console.error('Sidebar: Error checking role:', error);
    }
}

/**
 * Update navigation items based on user role
 */
function updateNavForRole(userRole) {
    var sidebarNav = document.getElementById('sidebarNav');
    if (!sidebarNav) return;
    
    var isAdmin = (userRole === 'admin');
    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    console.log('Sidebar: updateNavForRole called with role:', userRole, 'isAdmin:', isAdmin);
    
    var visibleItems = NAVIGATION_ITEMS.filter(function(item) {
        if (item.requiresAdmin) {
            return isAdmin === true;
        }
        return true;
    });
    
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
    
    sidebarNav.innerHTML = navItemsHTML;
    
    var roleEl = document.getElementById('sidebarUserRole');
    if (roleEl) {
        roleEl.textContent = isAdmin ? 'Administrator' : 'User';
    }
}

window.updateNavForRole = updateNavForRole;

/**
 * Initialize user display in sidebar
 */
async function initUserDisplay() {
    var supabase = _supabaseClient || window.supabaseClient || window.supabase || window.mySupabase;
    
    if (!supabase) {
        console.warn('Sidebar: Supabase client not available for user display');
        return;
    }
    
    try {
        var result = await supabase.auth.getSession();
        var session = result.data.session;
        
        if (session && session.user) {
            if (session.user.email) {
                updateSidebarUser(session.user.email);
            }
            
            var userMetaRole = session.user.user_metadata && session.user.user_metadata.role;
            var appMetaRole = session.user.app_metadata && session.user.app_metadata.role;
            var userRole = userMetaRole || appMetaRole;
            
            console.log('Sidebar: User role check - user_metadata.role:', userMetaRole, 'app_metadata.role:', appMetaRole, 'using:', userRole);
            
            _userRole = userRole || null;
            updateNavForRole(_userRole);
        }
    } catch (error) {
        console.error('Sidebar: Error getting user:', error);
    }
}

/**
 * Update sidebar with user information
 */
function updateSidebarUser(email) {
    var avatarEl = document.getElementById('sidebarUserAvatar');
    var nameEl = document.getElementById('sidebarUserName');
    
    if (avatarEl && email) {
        var initials = email.substring(0, 2).toUpperCase();
        avatarEl.textContent = initials;
    }
    
    if (nameEl && email) {
        var username = email.split('@')[0];
        nameEl.textContent = username;
    }
}

window.updateSidebarUser = updateSidebarUser;

/**
 * Handle logout
 */
async function handleLogout() {
    var supabase = _supabaseClient || window.supabaseClient || window.supabase || window.mySupabase;
    
    try {
        if (supabase && supabase.auth) {
            await supabase.auth.signOut();
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    window.location.href = 'login.html';
}

window.handleLogout = handleLogout;

/**
 * Toggle mobile sidebar
 */
function toggleMobileSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('mobileOverlay');
    var hamburger = document.getElementById('hamburgerBtn');
    
    if (sidebar) {
        sidebar.classList.toggle('mobile-open');
    }
    if (overlay) {
        overlay.classList.toggle('active');
    }
    if (hamburger) {
        hamburger.classList.toggle('open');
    }
}

/**
 * Close mobile sidebar
 */
function closeMobileSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('mobileOverlay');
    var hamburger = document.getElementById('hamburgerBtn');
    
    if (sidebar) {
        sidebar.classList.remove('mobile-open');
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
    if (hamburger) {
        hamburger.classList.remove('open');
    }
}

function toggleSidebar() {
    toggleMobileSidebar();
}

window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;
window.toggleSidebar = toggleSidebar;

/**
 * Set the active page in navigation
 */
function setActivePage(page) {
    var currentPage = page || window.location.pathname.split('/').pop() || 'index.html';
    
    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function(item) {
        var href = item.getAttribute('href');
        var isActive = href === currentPage || currentPage.indexOf(href.replace('.html', '')) !== -1;
        
        if (isActive) {
            item.classList.add('active');
            item.setAttribute('aria-current', 'page');
        } else {
            item.classList.remove('active');
            item.removeAttribute('aria-current');
        }
    });
    
    closeMobileSidebar();
}

window.setActivePage = setActivePage;

function enableSmoothTransitions() {
    console.warn('Sidebar: enableSmoothTransitions() is deprecated. Use Router.init() instead.');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initSidebar,
        updateSidebarUser,
        setActivePage,
        NAVIGATION_ITEMS,
        SIDEBAR_CONFIG
    };
}

window.SidebarComponent = {
    init: initSidebar,
    updateUser: updateSidebarUser,
    updateNavForRole: updateNavForRole,
    setActivePage: setActivePage,
    NAVIGATION_ITEMS: NAVIGATION_ITEMS,
    SIDEBAR_CONFIG: SIDEBAR_CONFIG
};
