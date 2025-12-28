/**
 * ========================================
 * CLIENT-SIDE ROUTER
 * ========================================
 * 
 * Provides SPA-like navigation for MPA sites.
 * The sidebar stays mounted while only the main content area updates.
 * 
 * USAGE:
 * 1. Include this script after sidebar.js
 * 2. Call Router.init() after SidebarComponent.init()
 * 
 * ========================================
 */

(function() {
    'use strict';
    
    // Private state
    let contentContainer = null;
    let pageCache = new Map();
    let currentScripts = [];
    let isNavigating = false;
    let isInitialized = false;
    let onNavigateCallbacks = [];
    
    // Configuration
    const config = {
        contentSelector: '.main-wrapper',
        transitionDuration: 100,  // Faster transitions
        cacheEnabled: false,
        preloadEnabled: true,
        debug: false
    };
    
    /**
     * Utility: Debug logging
     */
    function log(...args) {
        if (config.debug) {
            console.log('[Router]', ...args);
        }
    }
    
    /**
     * Utility: Sleep for a duration
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Initialize the router
     */
    function init(options = {}) {
        // Prevent double initialization
        if (isInitialized) {
            log('Already initialized, skipping');
            return;
        }
        
        Object.assign(config, options);
        
        contentContainer = document.querySelector(config.contentSelector);
        
        if (!contentContainer) {
            console.error('[Router] Content container not found:', config.contentSelector);
            return;
        }
        
        // Setup navigation interception - use capture phase to intercept before other handlers
        document.addEventListener('click', handleLinkClick, true);
        
        // Handle browser back/forward buttons
        window.addEventListener('popstate', handlePopState);
        
        // Preload linked pages for faster navigation
        if (config.preloadEnabled) {
            setTimeout(preloadLinkedPages, 1000);
        }
        
        // Store initial page state
        history.replaceState({ url: location.href, title: document.title }, '', location.href);
        
        isInitialized = true;
        log('Initialized successfully');
        log('Content container:', contentContainer);
    }
    
    /**
     * Handle clicks on links
     */
    function handleLinkClick(e) {
        // Find the closest anchor tag
        const link = e.target.closest('a');
        
        if (!link) return;
        
        const href = link.getAttribute('href');
        
        // Skip if no href
        if (!href) return;
        
        log('Click detected on:', href);
        
        // Skip special links
        if (href.startsWith('#') ||
            href.startsWith('javascript:') ||
            href.startsWith('mailto:') ||
            href.startsWith('tel:') ||
            link.hasAttribute('target') ||
            link.hasAttribute('download') ||
            link.hasAttribute('data-no-router') ||
            e.ctrlKey || e.metaKey || e.shiftKey) {
            log('Skipping - special link or modifier key');
            return;
        }
        
        // Check if it's an external link
        if (href.startsWith('http')) {
            try {
                const url = new URL(href);
                if (url.origin !== location.origin) {
                    log('Skipping - external link');
                    return;
                }
            } catch {
                return;
            }
        }
        
        // This is a local link we should handle
        log('Intercepting navigation to:', href);
        
        // Prevent default navigation
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Navigate
        navigate(href);
    }
    
    /**
     * Handle browser back/forward navigation
     */
    function handlePopState(e) {
        log('Popstate:', e.state);
        if (e.state && e.state.url) {
            loadPage(e.state.url, false);
        } else {
            loadPage(location.href, false);
        }
    }
    
    /**
     * Navigate to a new page
     */
    async function navigate(url, pushState = true) {
        if (isNavigating) {
            log('Navigation already in progress');
            return;
        }
        
        // Normalize URL
        const fullUrl = new URL(url, location.href).href;
        
        // Don't navigate to current page
        if (fullUrl === location.href) {
            log('Already on this page');
            return;
        }
        
        log('Navigating to:', fullUrl);
        
        if (pushState) {
            history.pushState({ url: fullUrl, title: '' }, '', fullUrl);
        }
        
        await loadPage(fullUrl, true);
    }
    
    /**
     * Load a page's content
     */
    async function loadPage(url, animate = true) {
        isNavigating = true;
        log('Loading page:', url);
        
        // Trigger pre-navigation callbacks
        onNavigateCallbacks.forEach(cb => {
            try { cb('start', url); } catch(e) { console.error(e); }
        });
        
        // Dispatch unload event for current page cleanup
        window.dispatchEvent(new CustomEvent('routerPageUnload'));
        
        try {
            // Fade out current content
            if (animate && contentContainer) {
                contentContainer.style.transition = `opacity ${config.transitionDuration}ms ease-out`;
                contentContainer.style.opacity = '0';
                await sleep(config.transitionDuration);
            }
            
            // Fetch new content
            let html = config.cacheEnabled ? pageCache.get(url) : null;
            
            if (!html) {
                log('Fetching:', url);
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                html = await response.text();
                
                if (config.cacheEnabled) {
                    pageCache.set(url, html);
                }
            } else {
                log('Using cache');
            }
            
            // Parse the new page
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            
            // Extract main content
            const newContent = doc.querySelector(config.contentSelector);
            
            if (!newContent) {
                throw new Error('Content container not found in fetched page');
            }
            
            // Update document title
            const newTitle = doc.querySelector('title');
            if (newTitle) {
                document.title = newTitle.textContent;
            }
            
            // Cleanup old page scripts
            cleanupPageScripts();
            
            // Clear old initPage to prevent running wrong page's init
            window.initPage = null;
            
            // Replace content
            contentContainer.innerHTML = newContent.innerHTML;
            log('Content replaced');
            
            // Update sidebar active state
            if (typeof window.setActivePage === 'function') {
                window.setActivePage();
            }
            
            // Execute new page scripts
            await executePageScripts(doc);
            
            // Scroll to top
            window.scrollTo(0, 0);
            
            // Fade in new content
            if (animate && contentContainer) {
                contentContainer.style.opacity = '1';
            }
            
            // Trigger post-navigation callbacks
            onNavigateCallbacks.forEach(cb => {
                try { cb('complete', url); } catch(e) { console.error(e); }
            });
            
            // Dispatch load event for new page
            window.dispatchEvent(new CustomEvent('routerPageLoad', { detail: { url } }));
            
            log('Navigation complete');
            
        } catch (error) {
            console.error('[Router] Navigation failed:', error);
            
            // Restore opacity
            if (contentContainer) {
                contentContainer.style.opacity = '1';
            }
            
            // Fallback to traditional navigation
            log('Falling back to full page load');
            window.location.href = url;
            
        } finally {
            isNavigating = false;
        }
    }
    
    /**
     * Execute scripts from the new page
     */
    async function executePageScripts(doc) {
        log('Executing page scripts...');
        
        // Clear old initPage FIRST - this is critical
        log('Clearing old initPage');
        window.initPage = null;
        
        // Find ALL scripts in the body of the fetched document
        // (not just in the content container, since scripts are usually siblings to .main-wrapper)
        const bodyScripts = doc.querySelectorAll('body script');
        log('Found', bodyScripts.length, 'scripts in body');
        
        for (let i = 0; i < bodyScripts.length; i++) {
            const script = bodyScripts[i];
            log(`Script ${i}: src=${script.src || '(inline)'}, type=${script.type || '(none)'}`);
            
            // Skip external scripts that are already loaded globally
            if (script.src) {
                const src = script.src.toLowerCase();
                if (src.includes('supabase') || 
                    src.includes('sidebar.js') ||
                    src.includes('router.js') ||
                    src.includes('config.js') ||
                    src.includes('cdn.jsdelivr.net')) {
                    log(`  -> Skipping (already loaded)`);
                    continue;
                }
                log(`  -> Skipping external script`);
                continue;
            }
            
            // Skip module scripts - they won't work with dynamic execution
            if (script.type === 'module') {
                log(`  -> Skipping module script`);
                continue;
            }
            
            // Execute inline scripts
            if (script.textContent.trim()) {
                const preview = script.textContent.trim().substring(0, 100);
                log(`  -> Executing inline script: ${preview}...`);
                try {
                    // Create new script element and execute
                    const newScript = document.createElement('script');
                    newScript.textContent = script.textContent;
                    document.body.appendChild(newScript);
                    currentScripts.push(newScript);
                    log(`  -> Script executed, initPage is now: ${typeof window.initPage}`);
                } catch (error) {
                    console.error('[Router] Script execution error:', error);
                }
            }
        }
        
        log('After all scripts, window.initPage is:', typeof window.initPage);
        
        // Now call initPage if it was defined by the new scripts
        if (typeof window.initPage === 'function') {
            log('Calling initPage()');
            try {
                await window.initPage();
            } catch (error) {
                console.error('[Router] initPage error:', error);
            }
        } else {
            log('WARNING: No initPage function found after script execution');
        }
    }
    
    /**
     * Cleanup scripts from the previous page
     */
    function cleanupPageScripts() {
        currentScripts.forEach(script => {
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        });
        currentScripts = [];
    }
    
    /**
     * Preload linked pages
     */
    function preloadLinkedPages() {
        const links = document.querySelectorAll('.nav-item[href]');
        
        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('http')) {
                const prefetchLink = document.createElement('link');
                prefetchLink.rel = 'prefetch';
                prefetchLink.href = href;
                document.head.appendChild(prefetchLink);
                log('Prefetching:', href);
            }
        });
    }
    
    /**
     * Register a callback for navigation events
     */
    function onNavigate(callback) {
        onNavigateCallbacks.push(callback);
    }
    
    /**
     * Clear the page cache
     */
    function clearCache() {
        pageCache.clear();
        log('Cache cleared');
    }
    
    /**
     * Check if router is initialized
     */
    function isReady() {
        return isInitialized;
    }
    
    // Create public API
    const Router = {
        init,
        navigate,
        onNavigate,
        clearCache,
        isReady,
        config
    };
    
    // Make available globally
    window.Router = Router;
    
    console.log('[Router] Loaded and ready. Call Router.init() to start.');
})();
