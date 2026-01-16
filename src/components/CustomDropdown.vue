<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Number, Array],
    default: ''
  },
  options: {
    type: Array,
    required: true
    // Expected: [{ value: '', label: '' }] or ['value1', 'value2']
  },
  placeholder: {
    type: String,
    default: 'Select...'
  },
  multiple: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const dropdownRef = ref(null)

const normalizedOptions = computed(() => {
  return props.options.map(opt => {
    if (typeof opt === 'object') {
      return opt
    }
    return { value: opt, label: opt }
  })
})

const selectedLabel = computed(() => {
  if (props.multiple && Array.isArray(props.modelValue)) {
    if (props.modelValue.length === 0) return props.placeholder
    const labels = props.modelValue.map(v => {
      const opt = normalizedOptions.value.find(o => o.value === v)
      return opt ? opt.label : v
    })
    return labels.join(', ')
  }

  if (!props.modelValue) return props.placeholder
  const option = normalizedOptions.value.find(o => o.value === props.modelValue)
  return option ? option.label : props.placeholder
})

function toggle() {
  if (!props.disabled) {
    isOpen.value = !isOpen.value
  }
}

function selectOption(option) {
  if (props.multiple) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : []
    const index = current.indexOf(option.value)
    if (index === -1) {
      current.push(option.value)
    } else {
      current.splice(index, 1)
    }
    emit('update:modelValue', current)
  } else {
    emit('update:modelValue', option.value)
    isOpen.value = false
  }
}

function isSelected(option) {
  if (props.multiple && Array.isArray(props.modelValue)) {
    return props.modelValue.includes(option.value)
  }
  return props.modelValue === option.value
}

function handleClickOutside(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="dropdown" ref="dropdownRef" :class="{ disabled }">
    <button
      type="button"
      class="dropdown-toggle"
      :class="{ open: isOpen }"
      @click="toggle"
      :disabled="disabled"
    >
      <span class="dropdown-label">{{ selectedLabel }}</span>
      <svg
        class="dropdown-arrow"
        :class="{ rotated: isOpen }"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    <div v-if="isOpen" class="dropdown-menu">
      <button
        v-for="option in normalizedOptions"
        :key="option.value"
        type="button"
        class="dropdown-item"
        :class="{ active: isSelected(option) }"
        @click="selectOption(option)"
      >
        <span v-if="multiple" class="checkbox">
          <svg v-if="isSelected(option)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </span>
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
  display: inline-block;
}

.dropdown.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.dropdown-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-white);
  font-size: 14px;
  cursor: pointer;
  color: var(--color-text);
  min-width: 160px;
  width: 100%;
  text-align: left;
  transition: border-color 0.15s;
}

.dropdown-toggle:hover {
  border-color: var(--color-text-tertiary);
}

.dropdown-toggle.open {
  border-color: var(--color-primary);
}

.dropdown-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-arrow {
  flex-shrink: 0;
  transition: transform 0.2s;
}

.dropdown-arrow.rotated {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  z-index: 100;
  padding: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  text-align: left;
  font-size: 14px;
  color: var(--color-text);
  cursor: pointer;
  border-radius: 4px;
}

.dropdown-item:hover {
  background: var(--color-bg);
}

.dropdown-item.active {
  background: rgba(99, 91, 255, 0.1);
  color: var(--color-primary);
}

.checkbox {
  width: 16px;
  height: 16px;
  border: 1px solid var(--color-border);
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dropdown-item.active .checkbox {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}
</style>
