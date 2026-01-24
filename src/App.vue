<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useAlerts } from '@/composables/useAlerts'
import Sidebar from '@/components/Sidebar.vue'
import AlertMessage from '@/components/AlertMessage.vue'

const route = useRoute()
const { isAuthenticated, initialize } = useAuth()
const { alerts, removeAlert } = useAlerts()

// Environment indicator
const isStaging = import.meta.env.MODE === 'staging'
const envLabel = isStaging ? 'STAGING' : null

// Load sidebar state synchronously to prevent layout shift on page load
const savedSidebarState = localStorage.getItem('sidebar-collapsed')
const isSidebarCollapsed = ref(savedSidebarState === 'true')

// Disable transitions on initial load to prevent shift
const initialLoad = ref(true)

// Determine if we should show the sidebar layout
const showSidebar = computed(() => {
  return isAuthenticated.value && route.meta.layout !== 'none'
})

function handleSidebarCollapse(e) {
  isSidebarCollapsed.value = e.detail.collapsed
}

onMounted(() => {
  initialize()
  // Listen for collapse events
  window.addEventListener('sidebar-collapse', handleSidebarCollapse)
  // Enable transitions after initial paint is complete
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initialLoad.value = false
    })
  })
})

onUnmounted(() => {
  window.removeEventListener('sidebar-collapse', handleSidebarCollapse)
})
</script>

<template>
  <div id="app-root" :class="{ 'has-env-banner': isStaging, 'initial-load': initialLoad }">
    <!-- Environment banner -->
    <div v-if="isStaging" class="env-banner">
      <span class="env-banner-icon">⚠️</span>
      <span class="env-banner-text">{{ envLabel }} ENVIRONMENT</span>
      <span class="env-banner-hint">Changes here won't affect production</span>
    </div>

    <!-- Toast notifications -->
    <Teleport to="body">
      <div class="toast-container">
        <TransitionGroup name="toast">
          <div
            v-for="alert in alerts"
            :key="alert.id"
            class="toast"
            :class="`toast-${alert.type}`"
          >
            <AlertMessage
              :type="alert.type"
              :message="alert.message"
              dismissible
              @dismiss="removeAlert(alert.id)"
            />
          </div>
        </TransitionGroup>
      </div>
    </Teleport>

    <!-- App layout -->
    <div v-if="showSidebar" class="app-layout">
      <Sidebar />
      <main class="main-wrapper" :class="{ 'sidebar-collapsed': isSidebarCollapsed }">
        <RouterView v-slot="{ Component, route: currentRoute }">
          <Transition :name="initialLoad ? '' : 'fade'" mode="out-in">
            <KeepAlive>
              <component :is="Component" :key="currentRoute.path" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- No sidebar layout (login page) -->
    <div v-else>
      <RouterView v-slot="{ Component }">
        <Transition :name="initialLoad ? '' : 'fade'" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </div>
  </div>
</template>

<style>
#app-root {
  min-height: 100vh;
}

/* Disable all transitions on initial page load to prevent layout shift */
#app-root.initial-load,
#app-root.initial-load *,
#app-root.initial-load *::before,
#app-root.initial-load *::after {
  transition: none !important;
  animation: none !important;
}

#app-root.has-env-banner {
  padding-top: 36px;
}

.env-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 36px;
  background: linear-gradient(90deg, #f59e0b, #d97706);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 13px;
  font-weight: 600;
  z-index: 10000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.env-banner-icon {
  font-size: 14px;
}

.env-banner-text {
  letter-spacing: 0.05em;
}

.env-banner-hint {
  font-weight: 400;
  opacity: 0.9;
  font-size: 12px;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
}

.toast {
  animation: slideIn 0.3s ease;
}

.toast-enter-active {
  animation: slideIn 0.3s ease;
}

.toast-leave-active {
  animation: slideOut 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes slideOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
</style>
