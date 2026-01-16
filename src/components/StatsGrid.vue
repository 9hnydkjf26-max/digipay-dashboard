<script setup>
defineProps({
  stats: {
    type: Array,
    required: true
    // Expected: [{ label: 'Total', value: '$1,234', change: '+5%', positive: true }]
  },
  columns: {
    type: Number,
    default: 4
  },
  loading: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <div class="stats-grid" :style="{ '--columns': columns }">
    <template v-if="loading">
      <div v-for="i in columns" :key="i" class="stat-card">
        <div class="skeleton stat-label-skeleton"></div>
        <div class="skeleton stat-value-skeleton"></div>
      </div>
    </template>

    <template v-else>
      <div v-for="(stat, index) in stats" :key="index" class="stat-card">
        <div class="stat-label">{{ stat.label }}</div>
        <div class="stat-value">
          <slot :name="`value-${index}`" :stat="stat">
            {{ stat.value }}
          </slot>
        </div>
        <div
          v-if="stat.change"
          class="stat-change"
          :class="{ positive: stat.positive, negative: stat.positive === false }"
        >
          {{ stat.change }}
        </div>
        <div v-if="stat.subtitle" class="stat-subtitle">
          {{ stat.subtitle }}
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

@media (min-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(var(--columns, 4), 1fr);
  }
}

.stat-card {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: 20px;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.2;
}

.stat-change {
  font-size: 13px;
  margin-top: 8px;
  color: var(--color-text-tertiary);
}

.stat-change.positive {
  color: var(--color-success);
}

.stat-change.negative {
  color: var(--color-error);
}

.stat-subtitle {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
}

/* Loading skeleton */
.skeleton {
  background: linear-gradient(90deg, var(--color-bg) 25%, var(--color-border) 50%, var(--color-bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

.stat-label-skeleton {
  height: 16px;
  width: 60%;
  margin-bottom: 12px;
}

.stat-value-skeleton {
  height: 32px;
  width: 80%;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
