<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: {
    type: String,
    default: 'info',
    validator: (v) => ['success', 'error', 'warning', 'info'].includes(v)
  },
  message: {
    type: String,
    default: ''
  },
  dismissible: {
    type: Boolean,
    default: false
  },
  icon: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['dismiss'])

const iconSvg = computed(() => {
  const icons = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  }
  return icons[props.type]
})

function dismiss() {
  emit('dismiss')
}
</script>

<template>
  <div class="alert" :class="`alert-${type}`">
    <span v-if="icon" class="alert-icon" v-html="iconSvg"></span>
    <div class="alert-content">
      <slot>{{ message }}</slot>
    </div>
    <button v-if="dismissible" class="alert-dismiss" @click="dismiss" aria-label="Dismiss">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.alert {
  padding: 14px 16px;
  border-radius: var(--radius);
  font-size: 14px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.alert-success {
  background: rgba(0, 217, 36, 0.1);
  border: 1px solid rgba(0, 217, 36, 0.2);
  color: #00a81b;
}

.alert-error {
  background: rgba(205, 66, 70, 0.1);
  border: 1px solid rgba(205, 66, 70, 0.2);
  color: var(--color-error);
}

.alert-warning {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  color: #d97706;
}

.alert-info {
  background: rgba(99, 91, 255, 0.1);
  border: 1px solid rgba(99, 91, 255, 0.2);
  color: var(--color-primary);
}

.alert-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.alert-content {
  flex: 1;
  line-height: 1.5;
}

.alert-dismiss {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.alert-dismiss:hover {
  opacity: 1;
}

@media (prefers-color-scheme: dark) {
  .alert-success {
    color: #10b981;
  }
}
</style>
