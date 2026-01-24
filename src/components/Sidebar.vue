<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const route = useRoute()
const { user, userRole, isAdmin, logout } = useAuth()

const isMobileOpen = ref(false)
const isCollapsed = ref(false)

// Persist collapsed state
onMounted(() => {
  const saved = localStorage.getItem('sidebar-collapsed')
  if (saved !== null) {
    isCollapsed.value = saved === 'true'
  }
})

watch(isCollapsed, (val) => {
  localStorage.setItem('sidebar-collapsed', val.toString())
  window.dispatchEvent(new CustomEvent('sidebar-collapse', { detail: { collapsed: val } }))
})

// Organized navigation with sections
const navigationSections = [
  {
    label: 'Overview',
    items: [
      {
        to: '/reports',
        label: 'Dashboard',
        icon: 'dashboard'
      },
      {
        to: '/balances',
        label: 'Balances',
        icon: 'wallet'
      }
    ]
  },
  {
    label: 'Transactions',
    items: [
      {
        to: '/refunds',
        label: 'Refunds',
        icon: 'refund'
      },
      {
        to: '/cpt-reports',
        label: 'Transactions',
        icon: 'document'
      },
      {
        to: '/settlement-reports',
        label: 'Settlements',
        icon: 'bank'
      }
    ]
  },
  {
    label: 'Settings',
    items: [
      {
        to: '/pricing',
        label: 'Pricing',
        icon: 'tag'
      },
      {
        to: '/plugin-admin',
        label: 'Plugin Admin',
        icon: 'plugin',
        requiresAdmin: true
      },
      {
        to: '/admin',
        label: 'Admin',
        icon: 'settings',
        requiresAdmin: true
      },
      {
        to: '/documentation',
        label: 'Documentation',
        icon: 'document'
      }
    ]
  }
]

const visibleSections = computed(() => {
  return navigationSections.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (item.requiresAdmin) return isAdmin.value
      return true
    })
  })).filter(section => section.items.length > 0)
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
  return isAdmin.value ? 'Administrator' : 'Member'
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

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

watch(() => route.path, () => {
  closeMobileSidebar()
})
</script>

<template>
  <!-- Sidebar -->
  <aside class="sidebar-v2" :class="{ 'mobile-open': isMobileOpen, 'collapsed': isCollapsed }">
    <!-- Background effects -->
    <div class="sidebar-bg">
      <div class="sidebar-gradient"></div>
      <div class="sidebar-noise"></div>
    </div>

    <!-- Header -->
    <div class="sidebar-header">
      <router-link to="/reports" class="sidebar-brand">
        <!-- Full logo with icon and text matching original proportions -->
        <div class="brand-logo" :class="{ 'icon-only': isCollapsed }">
          <svg v-if="!isCollapsed" width="120" height="30" viewBox="0 0 141 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M33.8921 7.56622C33.477 6.87448 32.9288 6.27191 32.2794 5.79335C31.6299 5.31479 30.892 4.96974 30.1083 4.77816L11.7634 0.209484C10.8772 -0.0132057 9.95585 -0.0588962 9.05203 0.0750298C8.14821 0.208956 7.27968 0.519867 6.4962 0.989958C5.71272 1.46005 5.02967 2.08008 4.48617 2.81455C3.94267 3.54902 3.5494 4.38349 3.32889 5.27017L0.201106 17.8867C-0.198322 19.5076 0.00136674 21.2182 0.763393 22.7036C1.52542 24.1889 2.79846 25.3488 4.34805 25.9698L3.99662 27.5044C3.64407 28.6656 3.58473 29.896 3.82391 31.0858C4.06308 32.2755 4.59332 33.3875 5.36722 34.3222C5.8858 34.8724 6.51527 35.3062 7.21399 35.595C7.91271 35.8838 8.66477 36.0209 9.42045 35.9974C9.81296 36.0016 10.205 35.9702 10.5919 35.9037L25.3639 33.4671C26.7452 33.1285 28.0036 32.4087 28.9957 31.3896C29.9878 30.3706 30.6737 29.0934 30.9752 27.7035L32.6387 20.3819L34.6653 12.1817C34.847 11.3994 34.8723 10.5889 34.7396 9.79677C34.6069 9.00466 34.3189 8.2466 33.8921 7.56622ZM30.6472 9.99113H30.8346C30.9097 9.98386 30.9849 10.0047 31.0455 10.0497C31.1509 10.1551 31.2915 10.5534 31.1275 11.2914L27.8006 25.8643C27.552 26.5183 27.0732 27.0589 26.4541 27.3847C25.835 27.7104 25.1182 27.7988 24.4385 27.6332L8.38957 23.6503L9.32673 19.5502C10.0999 16.1413 13.1222 12.8729 15.9103 12.416L30.6472 9.99113ZM3.80918 21.4128C3.56214 21.006 3.39774 20.5546 3.32537 20.0842C3.25301 19.6138 3.27411 19.1338 3.38746 18.6716L6.51524 6.06676C6.70865 5.27993 7.15964 4.58038 7.79647 4.07941C8.43329 3.57845 9.21936 3.30484 10.0296 3.30212C10.3295 3.30251 10.6283 3.3379 10.9199 3.40756L26.3245 7.2265L15.3597 9.03054C11.1893 9.72169 7.07754 13.9975 5.98809 18.777L5.09778 22.678C4.56538 22.3757 4.12118 21.9396 3.80918 21.4128ZM9.95931 32.5182C9.59283 32.6143 9.20788 32.6152 8.84093 32.5209C8.47398 32.4266 8.13718 32.2402 7.86241 31.9793C7.49151 31.4441 7.2507 30.8297 7.15918 30.185C7.06766 29.5403 7.12796 28.8831 7.33526 28.2658L7.66327 26.8601L22.3064 30.4682L9.95931 32.5182Z" fill="#06b6d4"/>
            <path d="M46.6226 26V10.1297H53.1003C54.7505 10.1297 56.154 10.415 57.3108 10.9857C58.4675 11.5563 59.3543 12.4277 59.9712 13.5999C60.6036 14.7566 60.9198 16.2449 60.9198 18.0648C60.9198 19.8693 60.6036 21.3577 59.9712 22.5298C59.3543 23.702 58.4675 24.5734 57.3108 25.144C56.154 25.7147 54.7505 26 53.1003 26H46.6226ZM50.0697 23.1545H53.0771C53.7712 23.1545 54.3881 23.0542 54.9279 22.8537C55.4677 22.6532 55.915 22.3602 56.2697 21.9746C56.6244 21.5736 56.8943 21.0801 57.0794 20.494C57.2645 19.8925 57.357 19.1984 57.357 18.4119V17.7178C57.357 16.9313 57.2645 16.2449 57.0794 15.6589C56.8943 15.0574 56.6244 14.5638 56.2697 14.1782C55.915 13.7772 55.4677 13.4765 54.9279 13.276C54.3881 13.0601 53.7712 12.9521 53.0771 12.9521H50.0697V23.1545ZM63.725 26V10.1297H67.172V26H63.725ZM77.9014 26.2776C75.4029 26.2776 73.475 25.6144 72.1178 24.288C70.776 22.9462 70.1051 20.8718 70.1051 18.0648C70.1051 16.1987 70.429 14.6641 71.0767 13.4611C71.7245 12.2427 72.6653 11.3404 73.8991 10.7543C75.133 10.1528 76.6136 9.85208 78.341 9.85208C79.3743 9.85208 80.346 9.96776 81.2559 10.1991C82.1659 10.4304 82.9679 10.7852 83.6619 11.2633C84.3714 11.7414 84.9189 12.3429 85.3045 13.0678C85.7055 13.7772 85.906 14.6255 85.906 15.6126H82.4127C82.4127 15.1345 82.3047 14.7103 82.0888 14.3402C81.8883 13.97 81.6029 13.6616 81.2328 13.4148C80.8626 13.168 80.4385 12.983 79.9604 12.8596C79.4823 12.7362 78.981 12.6745 78.4567 12.6745C77.6547 12.6745 76.9529 12.7825 76.3514 12.9984C75.7499 13.1989 75.2487 13.5151 74.8477 13.9469C74.4621 14.3633 74.169 14.8877 73.9685 15.52C73.768 16.1524 73.6678 16.885 73.6678 17.7178V18.4119C73.6678 19.5686 73.8375 20.5171 74.1768 21.2574C74.5161 21.9977 75.025 22.553 75.7036 22.9231C76.3823 23.2778 77.2228 23.4552 78.2253 23.4552C79.0581 23.4552 79.7907 23.3318 80.4231 23.085C81.0709 22.8229 81.5721 22.4527 81.9268 21.9746C82.297 21.4965 82.4821 20.9104 82.4821 20.2164V20.0544H77.7395V17.4171H85.906V26H83.6388L83.338 24.288C82.8753 24.7353 82.3741 25.1055 81.8343 25.3985C81.3099 25.6915 80.7238 25.9075 80.0761 26.0463C79.4283 26.2005 78.7034 26.2776 77.9014 26.2776ZM89.2317 26V10.1297H92.6788V26H89.2317ZM96.1902 26V10.1297H104.449C105.591 10.1297 106.539 10.3456 107.295 10.7775C108.066 11.1939 108.644 11.7877 109.03 12.5588C109.431 13.3146 109.631 14.2168 109.631 15.2656C109.631 16.3143 109.423 17.232 109.007 18.0186C108.606 18.7897 108.012 19.3912 107.225 19.8231C106.439 20.2549 105.475 20.4708 104.334 20.4708H99.6372V26H96.1902ZM99.6372 17.6484H103.871C104.596 17.6484 105.151 17.4402 105.537 17.0238C105.938 16.6074 106.138 16.029 106.138 15.2887C106.138 14.7797 106.053 14.3556 105.884 14.0163C105.714 13.677 105.459 13.4148 105.12 13.2297C104.796 13.0447 104.38 12.9521 103.871 12.9521H99.6372V17.6484ZM109.165 26L115.273 10.1297H119.53L125.637 26H121.913L120.779 22.8768H113.862L112.728 26H109.165ZM114.857 20.1007H119.784L118.373 16.191C118.311 16.0213 118.234 15.8208 118.142 15.5895C118.065 15.3427 117.98 15.0728 117.887 14.7797C117.795 14.4867 117.702 14.2014 117.61 13.9238C117.532 13.6307 117.455 13.3685 117.378 13.1372H117.239C117.162 13.4302 117.062 13.7772 116.939 14.1782C116.815 14.5638 116.692 14.9417 116.568 15.3118C116.445 15.6666 116.345 15.9596 116.268 16.191L114.857 20.1007ZM130.232 26V19.6149L124.078 10.1297H128.08L132.013 16.5148H132.129L136.039 10.1297H139.809L133.702 19.6149V26H130.232Z" fill="rgba(255, 255, 255, 0.92)"/>
          </svg>
          <!-- Icon only when collapsed -->
          <svg v-else width="30" height="30" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M33.8921 7.56622C33.477 6.87448 32.9288 6.27191 32.2794 5.79335C31.6299 5.31479 30.892 4.96974 30.1083 4.77816L11.7634 0.209484C10.8772 -0.0132057 9.95585 -0.0588962 9.05203 0.0750298C8.14821 0.208956 7.27968 0.519867 6.4962 0.989958C5.71272 1.46005 5.02967 2.08008 4.48617 2.81455C3.94267 3.54902 3.5494 4.38349 3.32889 5.27017L0.201106 17.8867C-0.198322 19.5076 0.00136674 21.2182 0.763393 22.7036C1.52542 24.1889 2.79846 25.3488 4.34805 25.9698L3.99662 27.5044C3.64407 28.6656 3.58473 29.896 3.82391 31.0858C4.06308 32.2755 4.59332 33.3875 5.36722 34.3222C5.8858 34.8724 6.51527 35.3062 7.21399 35.595C7.91271 35.8838 8.66477 36.0209 9.42045 35.9974C9.81296 36.0016 10.205 35.9702 10.5919 35.9037L25.3639 33.4671C26.7452 33.1285 28.0036 32.4087 28.9957 31.3896C29.9878 30.3706 30.6737 29.0934 30.9752 27.7035L32.6387 20.3819L34.6653 12.1817C34.847 11.3994 34.8723 10.5889 34.7396 9.79677C34.6069 9.00466 34.3189 8.2466 33.8921 7.56622ZM30.6472 9.99113H30.8346C30.9097 9.98386 30.9849 10.0047 31.0455 10.0497C31.1509 10.1551 31.2915 10.5534 31.1275 11.2914L27.8006 25.8643C27.552 26.5183 27.0732 27.0589 26.4541 27.3847C25.835 27.7104 25.1182 27.7988 24.4385 27.6332L8.38957 23.6503L9.32673 19.5502C10.0999 16.1413 13.1222 12.8729 15.9103 12.416L30.6472 9.99113ZM3.80918 21.4128C3.56214 21.006 3.39774 20.5546 3.32537 20.0842C3.25301 19.6138 3.27411 19.1338 3.38746 18.6716L6.51524 6.06676C6.70865 5.27993 7.15964 4.58038 7.79647 4.07941C8.43329 3.57845 9.21936 3.30484 10.0296 3.30212C10.3295 3.30251 10.6283 3.3379 10.9199 3.40756L26.3245 7.2265L15.3597 9.03054C11.1893 9.72169 7.07754 13.9975 5.98809 18.777L5.09778 22.678C4.56538 22.3757 4.12118 21.9396 3.80918 21.4128ZM9.95931 32.5182C9.59283 32.6143 9.20788 32.6152 8.84093 32.5209C8.47398 32.4266 8.13718 32.2402 7.86241 31.9793C7.49151 31.4441 7.2507 30.8297 7.15918 30.185C7.06766 29.5403 7.12796 28.8831 7.33526 28.2658L7.66327 26.8601L22.3064 30.4682L9.95931 32.5182Z" fill="#06b6d4"/>
          </svg>
        </div>
      </router-link>

      <button class="collapse-toggle" @click="toggleCollapse" :title="isCollapsed ? 'Expand' : 'Collapse'">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path v-if="isCollapsed" d="M13 17l5-5-5-5M6 17l5-5-5-5"/>
          <path v-else d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/>
        </svg>
      </button>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
      <div v-for="section in visibleSections" :key="section.label" class="nav-section">
        <div class="nav-section-label" v-show="!isCollapsed">{{ section.label }}</div>

        <router-link
          v-for="item in section.items"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: route.path === item.to }"
          :title="isCollapsed ? item.label : ''"
        >
          <span class="nav-link-icon">
            <!-- Dashboard -->
            <svg v-if="item.icon === 'dashboard'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="9" rx="1"/>
              <rect x="14" y="3" width="7" height="5" rx="1"/>
              <rect x="14" y="12" width="7" height="9" rx="1"/>
              <rect x="3" y="16" width="7" height="5" rx="1"/>
            </svg>
            <!-- Wallet -->
            <svg v-else-if="item.icon === 'wallet'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/>
              <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>
            </svg>
            <!-- Refund -->
            <svg v-else-if="item.icon === 'refund'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
              <path d="M12 7v5l4 2"/>
            </svg>
            <!-- Document -->
            <svg v-else-if="item.icon === 'document'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <line x1="10" y1="9" x2="8" y2="9"/>
            </svg>
            <!-- Bank -->
            <svg v-else-if="item.icon === 'bank'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 21h18"/>
              <path d="M3 10h18"/>
              <path d="M5 6l7-3 7 3"/>
              <path d="M4 10v11"/>
              <path d="M20 10v11"/>
              <path d="M8 10v11"/>
              <path d="M12 10v11"/>
              <path d="M16 10v11"/>
            </svg>
            <!-- Flame -->
            <svg v-else-if="item.icon === 'flame'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
            </svg>
            <!-- Tag -->
            <svg v-else-if="item.icon === 'tag'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
              <path d="M7 7h.01"/>
            </svg>
            <!-- Plugin -->
            <svg v-else-if="item.icon === 'plugin'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <!-- Settings -->
            <svg v-else-if="item.icon === 'settings'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <span class="nav-link-text" v-show="!isCollapsed">{{ item.label }}</span>
        </router-link>
      </div>
    </nav>

    <!-- Footer -->
    <div class="sidebar-footer">
      <div class="user-card" :title="isCollapsed ? `${userName} (${displayRole})` : ''">
        <div class="user-avatar">
          <span>{{ userInitials }}</span>
        </div>
        <div class="user-details" v-show="!isCollapsed">
          <span class="user-name">{{ userName }}</span>
          <span class="user-role">{{ displayRole }}</span>
        </div>
      </div>

      <button class="logout-btn" @click="handleLogout" :title="isCollapsed ? 'Sign out' : ''">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span v-show="!isCollapsed">Sign out</span>
      </button>
    </div>
  </aside>

  <!-- Mobile Overlay -->
  <div class="mobile-overlay" :class="{ active: isMobileOpen }" @click="closeMobileSidebar"></div>

  <!-- Mobile Header -->
  <div class="mobile-header">
    <button class="hamburger" @click="toggleMobileSidebar" aria-label="Toggle menu">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div class="mobile-brand">
      <svg width="24" height="24" viewBox="0 0 36 36" fill="none">
        <path d="M33.8921 7.56622C33.477 6.87448 32.9288 6.27191 32.2794 5.79335C31.6299 5.31479 30.892 4.96974 30.1083 4.77816L11.7634 0.209484C10.8772 -0.0132057 9.95585 -0.0588962 9.05203 0.0750298C8.14821 0.208956 7.27968 0.519867 6.4962 0.989958C5.71272 1.46005 5.02967 2.08008 4.48617 2.81455C3.94267 3.54902 3.5494 4.38349 3.32889 5.27017L0.201106 17.8867C-0.198322 19.5076 0.00136674 21.2182 0.763393 22.7036C1.52542 24.1889 2.79846 25.3488 4.34805 25.9698L3.99662 27.5044C3.64407 28.6656 3.58473 29.896 3.82391 31.0858C4.06308 32.2755 4.59332 33.3875 5.36722 34.3222C5.8858 34.8724 6.51527 35.3062 7.21399 35.595C7.91271 35.8838 8.66477 36.0209 9.42045 35.9974C9.81296 36.0016 10.205 35.9702 10.5919 35.9037L25.3639 33.4671C26.7452 33.1285 28.0036 32.4087 28.9957 31.3896C29.9878 30.3706 30.6737 29.0934 30.9752 27.7035L32.6387 20.3819L34.6653 12.1817C34.847 11.3994 34.8723 10.5889 34.7396 9.79677C34.6069 9.00466 34.3189 8.2466 33.8921 7.56622Z" fill="#06b6d4"/>
      </svg>
      <span>DigiPay</span>
    </div>
    <div style="width: 40px;"></div>
  </div>
</template>

<style scoped>
/* ========================================
   SIDEBAR V2 - Refined Design
   ======================================== */

.sidebar-v2 {
  --width-expanded: 260px;
  --width-collapsed: 68px;

  /* Colors */
  --bg-primary: #08090c;
  --bg-secondary: rgba(255, 255, 255, 0.02);
  --bg-hover: rgba(255, 255, 255, 0.04);
  --bg-active: rgba(99, 91, 255, 0.1);
  --border-color: rgba(255, 255, 255, 0.06);
  --text-primary: rgba(255, 255, 255, 0.92);
  --text-secondary: rgba(255, 255, 255, 0.55);
  --text-muted: rgba(255, 255, 255, 0.3);
  --accent: #635bff;
  --accent-cyan: #06b6d4;

  width: var(--width-expanded);
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease;
  overflow: hidden;
}

.sidebar-v2.collapsed {
  width: var(--width-collapsed);
}

/* Background layers */
.sidebar-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.sidebar-gradient {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99, 91, 255, 0.12), transparent),
    radial-gradient(ellipse 60% 40% at 80% 100%, rgba(6, 182, 212, 0.06), transparent),
    linear-gradient(180deg, #0a0c10 0%, #070809 100%);
}

.sidebar-noise {
  position: absolute;
  inset: 0;
  opacity: 0.035;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* Header */
.sidebar-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 16px;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  min-width: 0;
}

.brand-logo {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-logo svg {
  filter: drop-shadow(0 2px 8px rgba(6, 182, 212, 0.3));
}

.brand-logo.icon-only {
  width: 36px;
  height: 36px;
}

.collapse-toggle {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.collapse-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
  border-color: rgba(255, 255, 255, 0.1);
}

.sidebar-v2.collapsed .sidebar-header {
  justify-content: center;
  padding: 20px 12px;
}

.sidebar-v2.collapsed .collapse-toggle {
  position: absolute;
  right: 12px;
}

/* Navigation */
.sidebar-nav {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 16px 12px;
  overflow-y: auto;
  overflow-x: hidden;
}

.sidebar-nav::-webkit-scrollbar {
  width: 3px;
}

.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.nav-section {
  margin-bottom: 20px;
}

.nav-section:last-child {
  margin-bottom: 0;
}

.nav-section-label {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 0 12px;
  margin-bottom: 8px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  margin-bottom: 2px;
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.15s ease;
  position: relative;
}

.nav-link::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 0;
  background: var(--accent);
  border-radius: 0 1px 1px 0;
  transition: height 0.15s ease;
}

.nav-link:hover {
  background: var(--bg-hover);
}

.nav-link.active {
  background: var(--bg-active);
}

.nav-link.active::before {
  height: 20px;
  box-shadow: 0 0 8px rgba(99, 91, 255, 0.5);
}

.nav-link-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: color 0.15s ease;
}

.nav-link-icon svg {
  width: 18px;
  height: 18px;
}

.nav-link:hover .nav-link-icon {
  color: var(--text-primary);
}

.nav-link.active .nav-link-icon {
  color: var(--accent);
}

.nav-link-text {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
  transition: color 0.15s ease;
}

.nav-link:hover .nav-link-text {
  color: var(--text-primary);
}

.nav-link.active .nav-link-text {
  color: var(--text-primary);
  font-weight: 550;
}

/* Collapsed nav */
.sidebar-v2.collapsed .nav-section-label {
  display: none;
}

.sidebar-v2.collapsed .nav-link {
  justify-content: center;
  padding: 10px;
}

.sidebar-v2.collapsed .nav-section {
  margin-bottom: 8px;
}

/* Footer */
.sidebar-footer {
  position: relative;
  z-index: 1;
  padding: 16px 12px;
  border-top: 1px solid var(--border-color);
}

.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.user-avatar {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(99, 91, 255, 0.25);
}

.user-avatar span {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.user-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.user-name {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
  font-weight: 550;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
}

.logout-btn {
  width: 100%;
  height: 42px;
  margin-top: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.logout-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.sidebar-v2.collapsed .logout-btn {
  height: 40px;
  margin-top: 10px;
}

.sidebar-v2.collapsed .user-card {
  justify-content: center;
  padding: 8px;
}

/* Mobile */
.mobile-brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mobile-brand span {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

@media (max-width: 768px) {
  .sidebar-v2 {
    width: var(--width-expanded) !important;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .sidebar-v2.mobile-open {
    transform: translateX(0);
  }

  .collapse-toggle {
    display: none;
  }

  .sidebar-v2.collapsed .nav-section-label {
    display: block;
  }

  .sidebar-v2.collapsed .nav-link {
    justify-content: flex-start;
    padding: 10px 12px;
  }

  .sidebar-v2.collapsed .nav-link-text,
  .sidebar-v2.collapsed .user-details {
    display: flex !important;
  }

  .sidebar-v2.collapsed .brand-logo.icon-only svg:last-child {
    display: none;
  }

  .sidebar-v2.collapsed .brand-logo svg:first-child {
    display: block !important;
  }

  .sidebar-v2.collapsed .user-card {
    justify-content: flex-start;
    padding: 10px;
  }

}
</style>
