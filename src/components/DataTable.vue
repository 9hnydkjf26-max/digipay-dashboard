<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  columns: {
    type: Array,
    required: true
    // Expected: [{ key: 'id', label: 'ID', sortable: true, width: '100px' }]
  },
  data: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  emptyMessage: {
    type: String,
    default: 'No data available'
  },
  sortable: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['row-click', 'sort'])

const sortKey = ref('')
const sortOrder = ref('asc') // 'asc' or 'desc'

const sortedData = computed(() => {
  if (!sortKey.value || !props.sortable) {
    return props.data
  }

  return [...props.data].sort((a, b) => {
    const aVal = a[sortKey.value]
    const bVal = b[sortKey.value]

    if (aVal === null || aVal === undefined) return 1
    if (bVal === null || bVal === undefined) return -1

    let comparison = 0
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      comparison = aVal - bVal
    } else if (aVal instanceof Date && bVal instanceof Date) {
      comparison = aVal.getTime() - bVal.getTime()
    } else {
      comparison = String(aVal).localeCompare(String(bVal))
    }

    return sortOrder.value === 'asc' ? comparison : -comparison
  })
})

function handleSort(column) {
  if (!column.sortable || !props.sortable) return

  if (sortKey.value === column.key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = column.key
    sortOrder.value = 'asc'
  }

  emit('sort', { key: sortKey.value, order: sortOrder.value })
}

function handleRowClick(row, index) {
  emit('row-click', { row, index })
}

function getSortIcon(column) {
  if (!column.sortable || sortKey.value !== column.key) {
    return 'none'
  }
  return sortOrder.value
}
</script>

<template>
  <div class="table-container">
    <table class="data-table">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :class="{ sortable: column.sortable && sortable }"
            :style="column.width ? { width: column.width } : {}"
            @click="handleSort(column)"
          >
            <div class="th-content">
              <span>{{ column.label }}</span>
              <span v-if="column.sortable && sortable" class="sort-icon">
                <svg
                  v-if="getSortIcon(column) === 'asc'"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
                <svg
                  v-else-if="getSortIcon(column) === 'desc'"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <svg
                  v-else
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  style="opacity: 0.3"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loading">
          <tr v-for="i in 5" :key="i">
            <td v-for="column in columns" :key="column.key">
              <div class="skeleton" style="height: 20px; width: 80%;"></div>
            </td>
          </tr>
        </template>

        <template v-else-if="sortedData.length === 0">
          <tr>
            <td :colspan="columns.length" class="no-data">
              {{ emptyMessage }}
            </td>
          </tr>
        </template>

        <template v-else>
          <tr
            v-for="(row, index) in sortedData"
            :key="index"
            @click="handleRowClick(row, index)"
          >
            <td v-for="column in columns" :key="column.key">
              <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                {{ row[column.key] }}
              </slot>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-container {
  overflow-x: auto;
  border-radius: var(--radius);
  border: 1px solid var(--color-border);
  background: var(--color-card);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: left;
  padding: 12px 16px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.data-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.data-table th.sortable:hover {
  background: var(--color-border);
}

.th-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.sort-icon {
  display: flex;
  align-items: center;
}

.data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border);
  color: var(--color-text);
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr:hover {
  background: var(--color-bg);
}

.no-data {
  text-align: center;
  padding: 40px !important;
  color: var(--color-text-tertiary);
}

.skeleton {
  background: linear-gradient(90deg, var(--color-bg) 25%, var(--color-border) 50%, var(--color-bg) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
