<script setup>
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useAlerts } from '@/composables/useAlerts'
import Sidebar from '@/components/Sidebar.vue'
import AlertMessage from '@/components/AlertMessage.vue'

const route = useRoute()
const { isAuthenticated, initialize } = useAuth()
const { alerts, removeAlert } = useAlerts()

// Determine if we should show the sidebar layout
const showSidebar = computed(() => {
  return isAuthenticated.value && route.meta.layout !== 'none'
})

onMounted(() => {
  initialize()
})
</script>

<template>
  <div id="app-root">
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
      <main class="main-wrapper">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- No sidebar layout (login page) -->
    <div v-else>
      <RouterView v-slot="{ Component }">
        <Transition name="fade" mode="out-in">
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
