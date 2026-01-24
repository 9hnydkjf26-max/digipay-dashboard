import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from '@/composables/useSupabase'

// Lazy load views for better performance
const LoginView = () => import('@/views/LoginView.vue')
const ReportsView = () => import('@/views/ReportsView.vue')
const RefundsView = () => import('@/views/RefundsView.vue')
const AdminView = () => import('@/views/AdminView.vue')
const WarmupView = () => import('@/views/WarmupView.vue')
const BalancesView = () => import('@/views/BalancesView.vue')
const CptReportsView = () => import('@/views/CptReportsView.vue')
const SettlementReportsView = () => import('@/views/SettlementReportsView.vue')
const SitePricingView = () => import('@/views/SitePricingView.vue')
const PluginAdminView = () => import('@/views/PluginAdminView.vue')
const DocumentationView = () => import('@/views/DocumentationView.vue')

const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: { requiresAuth: false, layout: 'none' }
  },
  {
    path: '/reports',
    name: 'reports',
    component: ReportsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/refunds',
    name: 'refunds',
    component: RefundsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/cpt-reports',
    name: 'cpt-reports',
    component: CptReportsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/settlement-reports',
    name: 'settlement-reports',
    component: SettlementReportsView,
    meta: { requiresAuth: true }
  },
  {
    path: '/warmup',
    name: 'warmup',
    component: WarmupView,
    meta: { requiresAuth: true }
  },
  {
    path: '/balances',
    name: 'balances',
    component: BalancesView,
    meta: { requiresAuth: true }
  },
  {
    path: '/pricing',
    name: 'pricing',
    component: SitePricingView,
    meta: { requiresAuth: true }
  },
  {
    path: '/plugin-admin',
    name: 'plugin-admin',
    component: PluginAdminView,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/documentation',
    name: 'documentation',
    component: DocumentationView,
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  // Catch-all redirect to reports
  {
    path: '/:pathMatch(.*)*',
    redirect: '/reports'
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// Navigation guard for authentication
router.beforeEach(async (to, from, next) => {
  const requiresAuth = to.meta.requiresAuth !== false
  const requiresAdmin = to.meta.requiresAdmin === true

  // Get current session
  const { data: { session } } = await supabase.auth.getSession()

  if (requiresAuth && !session) {
    // Not authenticated, redirect to login
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  if (!requiresAuth && session && to.name === 'login') {
    // Already authenticated, redirect away from login
    next({ name: 'reports' })
    return
  }

  if (requiresAdmin && session) {
    // Check admin role
    const userRole = session.user?.user_metadata?.role || session.user?.app_metadata?.role
    if (userRole !== 'admin') {
      // Not admin, redirect to reports
      next({ name: 'reports' })
      return
    }
  }

  next()
})

export default router
