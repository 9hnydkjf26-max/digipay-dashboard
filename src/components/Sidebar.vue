<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const route = useRoute()
const { user, userRole, isAdmin, logout } = useAuth()

const isMobileOpen = ref(false)

const navigationItems = [
  {
    to: '/refunds',
    label: 'Refunds',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h10a5 5 0 0 1 5 5v6H8a5 5 0 0 1-5-5v-6z"/><path d="M7 10V6a5 5 0 0 1 10 0v4"/></svg>`
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`
  },
  {
    to: '/cpt-reports',
    label: 'CPT Reports',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
  },
  {
    to: '/settlement-reports',
    label: 'Settlement Report',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12l-3-3m0 0l-3 3m3-3v12"/></svg>`
  },
  {
    to: '/warmup',
    label: 'Warm Up',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>`
  },
  {
    to: '/balances',
    label: 'Balances',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 10v4"/><path d="M2 10h20"/></svg>`
  },
  {
    to: '/pricing',
    label: 'Pricing',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    requiresAdmin: true
  }
]

const visibleNavItems = computed(() => {
  return navigationItems.filter(item => {
    if (item.requiresAdmin) {
      return isAdmin.value
    }
    return true
  })
})

const userInitials = computed(() => {
  if (!user.value?.email) return ''
  return user.value.email.substring(0, 2).toUpperCase()
})

const userName = computed(() => {
  if (!user.value?.email) return ''
  return user.value.email.split('@')[0]
})

const displayRole = computed(() => {
  return isAdmin.value ? 'Admin' : 'User'
})

function toggleMobileSidebar() {
  isMobileOpen.value = !isMobileOpen.value
}

function closeMobileSidebar() {
  isMobileOpen.value = false
}

async function handleLogout() {
  await logout()
  router.push('/login')
}

// Close mobile sidebar on route change
watch(() => route.path, () => {
  closeMobileSidebar()
})
</script>

<template>
  <!-- Sidebar -->
  <div class="sidebar" :class="{ 'mobile-open': isMobileOpen }">
    <div class="sidebar-header" style="text-align: center;">
      <router-link to="/reports" class="sidebar-logo">
        <img src="@/assets/digipaylogo.svg" alt="DigiPay Logo" style="height: 40px; width: auto; display: block; margin: 0 auto;">
      </router-link>
    </div>

    <nav class="sidebar-nav">
      <router-link
        v-for="item in visibleNavItems"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: route.path === item.to }"
      >
        <span class="nav-item-icon" v-html="item.icon"></span>
        {{ item.label }}
      </router-link>
    </nav>

    <div class="sidebar-footer">
      <div class="user-profile">
        <div class="user-avatar">{{ userInitials }}</div>
        <div class="user-info-sidebar">
          <div class="user-name">{{ userName }}</div>
          <div class="user-role">{{ displayRole }}</div>
        </div>
      </div>
      <button class="btn btn-secondary" style="width: 100%;" @click="handleLogout">
        Sign out
      </button>
    </div>
  </div>

  <!-- Mobile Overlay -->
  <div
    class="mobile-overlay"
    :class="{ active: isMobileOpen }"
    @click="closeMobileSidebar"
  ></div>

  <!-- Mobile Header -->
  <div class="mobile-header">
    <button class="hamburger" @click="toggleMobileSidebar" aria-label="Toggle menu">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div class="sidebar-logo">
      <img src="@/assets/digipaylogo.svg" alt="DigiPay Logo" style="height: 32px; width: auto;">
    </div>
    <div style="width: 40px;"></div>
  </div>
</template>
