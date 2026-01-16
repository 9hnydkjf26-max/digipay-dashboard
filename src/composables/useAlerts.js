import { ref } from 'vue'

const alerts = ref([])
let alertId = 0

export function useAlerts() {
  function addAlert(message, type = 'info', duration = 5000) {
    const id = ++alertId
    const alert = {
      id,
      message,
      type, // 'success', 'error', 'warning', 'info'
      timestamp: Date.now()
    }

    alerts.value.push(alert)

    if (duration > 0) {
      setTimeout(() => {
        removeAlert(id)
      }, duration)
    }

    return id
  }

  function removeAlert(id) {
    const index = alerts.value.findIndex(a => a.id === id)
    if (index !== -1) {
      alerts.value.splice(index, 1)
    }
  }

  function clearAlerts() {
    alerts.value = []
  }

  // Convenience methods
  function success(message, duration) {
    return addAlert(message, 'success', duration)
  }

  function error(message, duration = 8000) {
    return addAlert(message, 'error', duration)
  }

  function warning(message, duration) {
    return addAlert(message, 'warning', duration)
  }

  function info(message, duration) {
    return addAlert(message, 'info', duration)
  }

  return {
    alerts,
    addAlert,
    removeAlert,
    clearAlerts,
    success,
    error,
    warning,
    info
  }
}
